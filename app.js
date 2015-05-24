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
var async = require('async');

var Twit = require('twit');

var twits = {};

app.use(allowLocalAccess);
app.use(express.static('public'));
app.use(session({ store: new RedisStore({
  host: '127.0.0.1',
  port: 6379
}), secret: 'sdklfjdsklghk flkjouxn89ecgosyecogvyseo8ycgoghmeshgsgsetest87s8te8st78str78trsDTUPLU:DTY:RSYKSRY:LKJRSYSJYY' }));
app.use(passport.initialize());
app.use(passport.session({
	cookie: {
		secure: false
	}
}));

var saveUser = function(token, tokenSecret, profile) {
	var payload = {};
	payload['token'] = token;
	payload['tokenSecret'] = tokenSecret;
	payload['username'] = profile.username;
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



var getClient = function(id, cb) {

	if (twits[id] === undefined) {
		client.hgetall(id.toString() + '_keys', function(err, obj) {
			if (err === null) {
				console.log(obj);
				twits[id] = new Twit({
					consumer_key: config.TWITTER_CONSUMER_KEY,
					consumer_secret: config.TWITTER_CONSUMER_SECRET,
					access_token: obj.token,
					access_token_secret: obj.tokenSecret
				});
				cb(null, twits[id]);
			} else {
				cb(err, null);
			}
		});
	} else {
		cb(null, twits[id]);
	}
};



var tweetEmbed = function(userId, tweet, cb) {
	var tweetId = tweet.id_str;
	client.get('tweet_' + tweetId, function(err, html) {
		if (err !== null) {
			cb(err, null);
			return;
		}

		if (html === null) {
			getClient(userId, function(err, twit) {
				if (err !== null) {
					cb(err, null);
					return;
				}
				twit.get('statuses/oembed', { id: tweetId }, function(err, data, response) {
					if (err !== null) {
						cb(err, null);
						return;
					}

					// strip out js.
					var newhtml = data.html.replace(config.TWITTER_JS, '');
					client.set('tweet_' + tweetId, newhtml, function(err) {
						if (err !== null) {
							cb(err, null);
							return;
						}
						cb(null, newhtml);
					});
				});
			});
		} else {
			cb(null, html);
		}
	});
};

var tweetEmbedClosure = function(userId) {
	return function(tweetId, cb) {
		return tweetEmbed(userId, tweetId, cb);
	};
};


// Redirect the user to Twitter for authentication.  When complete, Twitter
// will redirect the user back to the application at
//   /auth/twitter/callback
app.get('/auth/twitter', passport.authenticate('twitter'));

// Twitter will redirect the user to this URL after approval.  Finish the
// authentication process by attempting to obtain an access token.  If
// access was granted, the user will be logged in.  Otherwise,
// authentication has failed.
app.get('/auth/twitter/callback',
  passport.authenticate('twitter', { successRedirect: '/dashboard',
                                     failureRedirect: '/login' }));


app.get('/api/authenticated', ensureAuthenticated, function(req, res) {
	res.json({
		authenticated: req.isAuthenticated()
	});
});

app.get('/api/dashboard-data', ensureAuthenticated, function(req, res) {

	getClient(req.user.id, function(err, twit) {
		if (err === null) {
			console.log(req.user.id.toString());
			twit.get('statuses/user_timeline', { id: req.user.id.toString() },  function (err, data, response) {

				var tweets = [''];

				var closure = tweetEmbedClosure(req.user.id.toString());

				async.map(data, closure, function(err, tweets) {
					if (err) {
						console.error(err);
					} else {
						res.json({
							html: tweets.join('\n')
						});
					}
				});
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