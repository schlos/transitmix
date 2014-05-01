# TransitMix

TODO: What is this?

## Setup

[Install PostgreSQL](https://github.com/codeforamerica/howto/blob/master/PostgreSQL.md).

```console
git clone https://github.com/codeforamerica/transitmix.git
cd transitmix
bundle install
rake db:create db:migrate
bundle exec rackup
```

## Deploy

```console
heroku create <app name>
heroku addons:add heroku-postgresql
git push heroku master
heroku run rake db:migrate
heroku open
```
