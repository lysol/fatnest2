var express = require('express');
var app = express();
var config = require('./config');
var fs = require('fs');
var session = require('express-session');
var bodyParser = require('body-parser');
var passport = require('passport')
  , TwitterStrategy = require('passport-twitter').Strategy;

var RedisStore = require('connect-redis')(session);
var redis = require("redis"),
      client = redis.createClient();
var async = require('async');

var Twit = require('twit');

var twits = {};
var userCache = {};

function isNumeric(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
}


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
app.use(bodyParser.json())

var saveUser = function(token, tokenSecret, profile) {
	var payload = {};
	payload['token'] = token;
	payload['tokenSecret'] = tokenSecret;
	payload['username'] = profile.username;
	client.hmset(profile.id.toString() + ':keys', payload);
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
		client.hgetall(id.toString() + ':keys', function(err, obj) {
			if (err === null) {
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
		if (err) {
			cb(err, null);
			return;
		}

		if (html === null) {
			getClient(userId, function(err, twit) {
				if (err) {
					cb(err, null);
					return;
				}
				twit.get('statuses/oembed', { id: tweetId }, function(err, data, response) {
					if (err) {
						cb(err, null);
						return;
					}

					// strip out js.
					var newhtml = data.html.replace(config.TWITTER_JS, '');
					client.set('tweet_' + tweetId, newhtml, function(err) {
						if (err) {
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


var getUserCached = function(clientId, userId, callback) {
	getClient(clientId, function(err, twit) {
		console.log(err, twit);
		if (err) {
			callback(err, null);
			return;
		}

		if (userCache[userId] !== undefined) {
			callback(null, userCache[userId]);
			return;
		}

		var data = {};

		if (isNumeric(userId)) {
			data.user_id = userId;
		} else {
			data.screen_name = userId;
		}

		twit.get('users/show', data, function(err, user) {
			userCache[userId] = user;
			callback(null, user);
			return;
		});
	});
};

var getTwitterUsersForIDs = function(clientId, userIDs, callback) {
	var closure = function(twitterId, cb) {
		twitterId = twitterId.toString();
		getUserCached(clientId, twitterId, function(err, user) {
			if (err) {
				cb(err, null);
			} else {
				cb(null, user);
			}
		});
	};

	async.map(userIDs, closure, function(err, twitterUsers) {
		if (err) {
			callback(err,  null);
			return;
		}

		callback(null, twitterUsers);
	});
};

var getDelegatedToAccounts = function(userId, callback) {
	client.smembers(userId + ':delegated-to', function(err, twitter_ids) {
		if (err) {
			callback(err, null);
			return;
		}

		getTwitterUsersForIDs(userId, twitter_ids, function(err, users) {
			if (err) {
				callback(err, null);
				return;
			}

			callback(null, users);
		});			
	});
};

var getDelegatedAccounts = function(userId, callback) {
	client.smembers(userId + ':delegated', function(err, twitter_ids) {
		if (err) {
			callback(err, null);
			return;
		}

		getTwitterUsersForIDs(userId, twitter_ids, function(err, users) {
			if (err) {
				callback(err, null);
				return;
			}
			getUserCached(userId, userId, function(err, user) {
				if (err) {
					callback(err, null);
					return;
				}
				users.push(user);
				callback(null, users);
			});
		});
	});

};

var removeDelegate = function(userId, targetUserId, callback) {
	client.srem(userId + ':delegated-to', targetUserId, function(err, res) {
		if (err) {
			callback(err, undefined);
			return;
		}

		client.srem(targetUserId + ':delegated', userId, function(err, res) {
			if (err) {
				callback(err, undefined);
				return;
			}

			callback(undefined, true);
		});
	});
};

var createDelegate = function(userId, screenName, callback) {
	getUserCached(userId, screenName, function(err, user) {
		console.log(user);
		if (err) {
			callback(err, undefined);
			return;
		}
		client.sadd(userId + ':delegated-to', user.id, function(err, res) {
			if (err) {
				callback(err, undefined);
				return;
			}
			client.sadd(user.id + ':delegated', userId, function(err, res) {
				if (err) {
					callback(err, undefined);
					return;
				}
				callback(undefined, user);
			});
		});
	});
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

app.get('/api/delegated-to-accounts', ensureAuthenticated, function(req, res) {
	getDelegatedToAccounts(req.user.id.toString(), function(err, delegatedToAccounts) {
		if (err) {
			console.error(err);
			return;
		}

		res.json({
			"delegated-to-accounts": delegatedToAccounts
		});
	});
});

app.get('/api/delegated-accounts', ensureAuthenticated, function(req, res) {
	getDelegatedAccounts(req.user.id.toString(), function(err, delegatedAccounts) {
		if (err) {
			console.error(err);
			return;
		}

		res.json({
			"primary-account-id": req.user.id,
			"delegated-accounts": delegatedAccounts
		});
	});

});

app.get('/api/recent-tweets', ensureAuthenticated, function(req, res) {

	getClient(req.user.id, function(err, twit) {
		if (err === null) {
			twit.get('statuses/user_timeline', { id: req.user.id.toString() },  function (err, data, response) {

				var tweets = [''];

				var closure = tweetEmbedClosure(req.user.id.toString());

				async.map(data, closure, function(err, tweets) {
					if (err) {
						console.error(err);
					} else {
						res.json({
							"html": tweets.join('\n')
						});
					}
				});
	        });
		} else {
			console.error(err);
		}
	});

});


app.post('/api/new-delegate', ensureAuthenticated, function(req, res) {
	createDelegate(req.user.id.toString(), req.body.screen_name, function(err, user) {
		res.json({ error: err, success: !err, user: user });
	});
});

app.post('/api/remove-delegate', ensureAuthenticated, function(req, res) {
	removeDelegate(req.user.id.toString(), req.body.user_id, function(err, result) {
		res.json({ error: err, success: !err && result });
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