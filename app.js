var express = require('express');
var app = express();
var config = require('./config');
var fs = require('fs');
var session = require('express-session');
var passport = require('passport')
  , TwitterStrategy = require('passport-twitter').Strategy;

var RedisStore = require('connect-redis')(session);
var redis = require("redis"),
      client = redis.createClient();
require('underscore');

var Twit = require('twit');

var twits = {};

app.use(allowLocalAccess);
app.use(express.static('public'));
app.use(session({ store: new RedisStore({
  host: '127.0.0.1',
  port: 6379
}), secret: 'sdklfjdsklghk flkjouxn89ecgosyecogvyseo8ycgoghmeshgsgsetest87s8te8st78str78trsDTUPLU:DTY:RSYKSRY:LKJRSYSJYY' }));
app.use(passport.initialize());
app.use(passport.session());

var saveUser = function(token, tokenSecret, profile) {
	var payload = {};
	payload['token'] = token;
	payload['tokenSecret'] = tokenSecret;
	console.log(profile.id.toString() + '_keys', payload);
	client.hmset(profile.id.toString() + '_keys', payload);
};

passport.use(new TwitterStrategy({
    consumerKey: config.TWITTER_CONSUMER_KEY,
    consumerSecret: config.TWITTER_CONSUMER_SECRET,
    callbackURL: "http://127.0.0.1:3000/auth/twitter/callback"
  },
  function(token, tokenSecret, profile, done) {
  	saveUser(token, tokenSecret, profile);
    done(null, profile);
  }
));

passport.serializeUser(function(user, done) {
	done(null, user);
});

passport.deserializeUser(function(obj, done) {
	done(null, obj);
});

// Redirect the user to Twitter for authentication.  When complete, Twitter
// will redirect the user back to the application at
//   /auth/twitter/callback
app.get('/auth/twitter', passport.authenticate('twitter'));

// Twitter will redirect the user to this URL after approval.  Finish the
// authentication process by attempting to obtain an access token.  If
// access was granted, the user will be logged in.  Otherwise,
// authentication has failed.
app.get('/auth/twitter/callback',
  passport.authenticate('twitter', { successRedirect: '/',
                                     failureRedirect: '/login' }));


app.get('/api/dashboard-data', ensureAuthenticated, function(req, res) {

	var getClient = function(cb) {
		if (twits[req.user.username] === undefined) {
			client.hgetall(req.user.id.toString() + '_keys', function(err, obj) {
				if (err === null) {
					console.log(obj);
					twits[req.user.username] = new Twit({
						consumer_key: config.TWITTER_CONSUMER_KEY,
						consumer_secret: config.TWITTER_CONSUMER_SECRET,
						access_token: obj.token,
						access_token_secret: obj.tokenSecret
					});
					cb(null, twits[req.user.username]);
				} else {
					cb(err, null);
				}
			});
		} else {
			cb(null, twits[req.user.username]);
		}
	};

	getClient(function(err, twit) {
		if (err === null) {
			twit.get('statuses/user_timeline', { screen_name: req.user.username }, function(err, data, response) {
				if (err === null) {
					res.json(data);
				} else {
					console.error(err);
				}
			});
		} else {
			console.error(err);
		}
	});

});


app.get('/dashboard', ensureAuthenticated, function(req, res) {
	res.sendFile('./public/index.html', { root: __dirname });
});

var server = app.listen(3000, function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log('Example app listening at http://%s:%s', host, port);
});


function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/')
}

function allowLocalAccess(req, res, next) {
	if (req.hostname === '127.0.0.1') {
		res.header("Access-Control-Allow-Origin", "http://localhost");
		res.header("Access-Control-Allow-Methods", "GET, POST");
	}
	return next();
}