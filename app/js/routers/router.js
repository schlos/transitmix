app.Router = Backbone.Router.extend({
  routes: {
    ':mapid/:lineid(/)': 'focusedMap',
    ':mapid(/)': 'blurredMap',
    '': 'home',
    '*default': 'error'
  },

  home: function() {
    // If we want to load recent routes and show them on the homepage...
    // var renderHome = function renderHome(collection) {
    //   if (this.view) this.view.remove();
    //   this.view = new app.HomeView({ collection: collection }).render();
    // };

    // var maps = new app.Maps();
    // maps.fetch({
    //   query: { limit: 10 },
    //   success: _.bind(renderHome, this)
  // });

    if (this.view) this.view.remove();
    this.view = new app.HomeView();
    $('body').append(this.view.render().el);
  },

  blurredMap: function(mapId) {
    this._loadMap(mapId, function(model) {
      model.blur();
    });
  },

  focusedMap: function(mapId, lineId) {
    this._loadMap(mapId, function(model) {
      model.focus(lineId);
    });
  },

  _loadMap: function(mapId, callback) {
    // If we already have a view with the apropriate model, we just need
    // to handle the blur/focus events, and skip data load / view rendering.
    if (this.view && this.view.model && this.view.model.id === mapId) {
      callback(this.view.model);
      return;
    }

    var renderMap = function(model) {
      if (this.view) this.view.remove();
      this.view = new app.MapView({ model: model });
      $('body').append(this.view.render().el);
      callback(model);
    };

    var map = new app.Map({ id: mapId });
    map.fetch({ success: _.bind(renderMap, this)});
  },

  error: function() {
    console.log('Route not found. Mild moment of panic.');
    this.navigate('', { trigger: true });
  },
});
