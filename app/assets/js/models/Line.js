// A line is an always-routed set of latlngs, stored in a 'coordinates'
// field, using a GeoJSON multilinestring represntation. Just give it a set
// of waypoints to navigate through, and it'll handle the rest.
app.Line = Backbone.Model.extend({
  urlRoot: '/api/lines',

  defaults: function() {
    var color = app.utils.getNextColor();
    var name = _.random(10, 99) + ' ' + app.utils.getRandomName();

    return {
      color: color,
      coordinates: [], // A GeoJSON MultiLineString
      mapId: undefined,
      name: name,
      serviceWindows: new app.ServiceWindows(),
    };
  },

  initialize: function() {
    // Automatically save after changes, at most once per second
    var debouncedSaved = _.debounce(function() { this.save(); }, 1000);
    this.on('change', debouncedSaved, this);
    this.get('serviceWindows').on('change', debouncedSaved, this);
  },

  parse: function(response) {
    // Use any existing nested models; create them otherwise.
    var serviceWindows = this.get('serviceWindows');
    if (!serviceWindows && response.service_windows) {
      serviceWindows = new app.ServiceWindows(response.service_windows);
    }

    // Import colors from GTFS
    var gtfsColor = response.route_color;
    if (gtfsColor && gtfsColor !== ' ' && gtfsColor !== '000000' && gtfsColor !== 'FFFFFF') {
      response.color = '#' + gtfsColor;
    }

    var attrs = {
      id: response.id,
      color: response.color,
      coordinates: response.coordinates,
      mapId: response.map_id,
      name: response.name,
      serviceWindows: serviceWindows,
      speed: response.speed,
      layover: response.layover,
      hourlyCost: response.hourly_cost,
      weekdaysPerYear: response.weekdays_per_year,
      saturdaysPerYear: response.saturdays_per_year,
      sundaysPerYear: response.sundays_per_year,
    };

    return app.utils.removeUndefined(attrs);
  },

  toJSON: function() {
    var attrs = this.attributes;
    var serviceWindows = attrs.serviceWindows.toJSON();

    return {
      id: attrs.id,
      color: attrs.color,
      coordinates: attrs.coordinates,
      map_id: attrs.mapId,
      name: attrs.name,
      service_windows: serviceWindows,
      hourly_cost: attrs.hourlyCost,
      speed: attrs.speed,
      layover: attrs.layover,
      weekdays_per_year: attrs.weekdaysPerYear,
      saturdays_per_year: attrs.saturdaysPerYear,
      sundays_per_year: attrs.sundaysPerYear,
    };
  },

  // Extends the line to the given latlng, routing in-between
  addWaypoint: function(latlng, ignoreRoads) {
    latlng = _.values(latlng);
    var coordinates = _.clone(this.get('coordinates'));

    if (coordinates.length === 0) {
      coordinates.push([latlng]);
      this.save({ coordinates: coordinates });
      return;
    }

    app.utils.getRoute({
      from: _.last(this.getWaypoints()),
      to: latlng,
      ignoreRoads: ignoreRoads,
    }, function(route) {
      coordinates.push(route);
      this.save({ coordinates: coordinates });
    }, this);
  },

  updateWaypoint: function(latlng, index, ignoreRoads) {
    latlng = _.values(latlng);

    if (index === 0) {
      this._updateFirstWaypoint(latlng, ignoreRoads);
    } else if (index === this.get('coordinates').length - 1) {
      this._updateLastWaypoint(latlng, ignoreRoads);
    } else {
      this._updateMiddleWaypoint(latlng, index, ignoreRoads);
    }
  },

  _updateFirstWaypoint: function(latlng, ignoreRoads) {
    var coordinates = _.clone(this.get('coordinates'));
    var secondWaypoint = _.last(coordinates[1]);

    app.utils.getRoute({
      from: latlng,
      to: secondWaypoint,
      ignoreRoads: ignoreRoads,
    }, function(route) {
      coordinates[0] = [route[0]];
      coordinates[1] = route;
      this.save({ coordinates: coordinates });
    }, this);
  },

  _updateMiddleWaypoint: function(latlng, index, ignoreRoads) {
    var coordinates = _.clone(this.get('coordinates'));
    var prevWaypoint = _.last(coordinates[index - 1]);
    var nextWaypoint = _.last(coordinates[index + 1]);

    app.utils.getRoute({
      from: prevWaypoint,
      via: latlng,
      to: nextWaypoint,
      ignoreRoads: ignoreRoads,
    }, function(route) {
      var closest = app.utils.indexOfClosest(route, latlng);
      coordinates[index] = route.slice(0, closest + 1);
      coordinates[index + 1] = route.slice(closest);
      this.save({ coordinates: coordinates });
    }, this);
  },

  _updateLastWaypoint: function(latlng, ignoreRoads) {
    var coordinates = _.clone(this.get('coordinates'));
    var penultimateWaypoint = _.last(coordinates[coordinates.length - 2]);

    app.utils.getRoute({
      from: penultimateWaypoint,
      to: latlng,
      ignoreRoads: ignoreRoads,
    }, function(route) {
      coordinates[coordinates.length - 1] = route;
      this.save({ coordinates: coordinates });
    }, this);
  },

  insertWaypoint: function(latlng, index, ignoreRoads) {
    var coordinates = _.clone(this.get('coordinates'));
    var prevWaypoint = _.last(coordinates[index - 1]);
    var newSegment = [prevWaypoint, latlng];

    coordinates.splice(index, 0, newSegment);
    this.set({ coordinates: coordinates }, { silent: true });
    this.updateWaypoint(latlng, index, ignoreRoads);
  },

  removeWaypoint: function(index, ignoreRoads) {
    var coordinates = _.clone(this.get('coordinates'));

    // If we only have one point, just reset coordinates to an empty array.
    if (coordinates.length === 1) {
      this.model.clearWaypoints();
      return;
    }

    // Drop the first segment, make the second segment just the last waypoint
    if (index === 0) {
      var secondWaypoint = _.last(coordinates[1]);
      coordinates.splice(0, 2, [secondWaypoint]);
      this.save({ coordinates: coordinates });
      return;
    }

    // Just drop the last segment
    if (index === coordinates.length - 1) {
      coordinates.splice(index, 1);
      this.save({ coordinates: coordinates });
      return;
    }

    // For middle waypoints, we drop the segment, then route 
    // the next waypoint, keep it's current location. 
    var nextWaypoint = _.last(coordinates[index + 1]);
    coordinates.splice(index, 1);
    this.set({ coordinates: coordinates }, { silent: true });
    this.updateWaypoint(nextWaypoint, index, ignoreRoads);
  },

  clearWaypoints: function() {
    // TODO: This fails in strange ways if we're in the middle of waiting
    // for the ajax call for a waypoint update. Need to figure out a
    // way to cancel existing ajax calls.
    this.save({ coordinates: [] });
  },

  getWaypoints: function() {
    var coordinates = this.get('coordinates');
    return _.map(coordinates, _.last);
  },

  getCalculations: function() {
    var attrs = this.attributes;
    var speed = attrs.speed;
    var latlngs = _.flatten(attrs.coordinates, true);

    // Double the distance because we're assuming roundtrip
    var distance = app.utils.calculateDistance(latlngs) * 2;

    var layover = this.get('layover');
    var hourlyCost = this.get('hourlyCost');

    var weekdays = this.get('weekdaysPerYear');
    var saturdays = this.get('saturdaysPerYear');
    var sundays = this.get('sundaysPerYear');

    var calculate = function(sw) {
      if (!sw.isValid()) {
        return {
          buses: 0,
          cost: 0,
          revenueHours: 0,
        };
      }

      var minutesPerDay = app.utils.diffTime(sw.get('from'), sw.get('to'));
      var hoursPerDay =  minutesPerDay / 60;
      var roundTripTime = (distance / speed) * (1 + layover) * 60;
      var buses = Math.ceil(roundTripTime / sw.get('headway'));

      var daysPerYear = weekdays;
      if (sw.get('isSaturday')) daysPerYear = saturdays;
      if (sw.get('isSunday')) daysPerYear = sundays;
      if (sw.get('isWeekend')) daysPerYear = saturdays + sundays;

      var revenueHours = buses * hoursPerDay * daysPerYear;
      var costPerYear = revenueHours * hourlyCost;

      return {
        buses: buses,
        cost: costPerYear,
        revenueHours: revenueHours,
      };
    };

    var perWindow = attrs.serviceWindows.map(calculate);
    var total = _.reduce(perWindow, function(memo, sw) {
      return {
        buses: Math.max(memo.buses, sw.buses),
        cost: memo.cost + sw.cost,
        revenueHours: memo.revenueHours + sw.revenueHours
      };
    }, { buses: 0, cost: 0, revenueHours: 0 });

    return {
      distance: distance,
      perWindow: perWindow,
      total: total
    };
  },
});
