var express = require('express');
var app = express();
var config = require('./config');
var session = require('express-session');
var bodyParser = require('body-parser');
var passport = require('passport');
var TwitterStrategy = require('passport-twitter').Strategy;
var swig = require('swig')

var RedisStore = require('connect-redis')(session);
var FatNest = require('./fatnest');
var fatNest = new FatNest(config);

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
app.use(bodyParser.json());
app.engine('html', swig.renderFile);
swig.setFilter('entityEscape', function (input) {
	return input
		// .replace(/\\/g, '\\\\')
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
});

app.set('view engine', 'html');
app.set('views', __dirname + '/public');



passport.use(new TwitterStrategy({
    consumerKey: config.TWITTER_CONSUMER_KEY,
    consumerSecret: config.TWITTER_CONSUMER_SECRET,
    callbackURL: "http://127.0.0.1:3000/auth/twitter/callback"
  },
  function(token, tokenSecret, profile, done) {
  	fatNest.saveUser(token, tokenSecret, profile);
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
  passport.authenticate('twitter', { successRedirect: '/dashboard',
                                     failureRedirect: '/login' }));

app.get('/logout', function(req, res){
  req.logout();
  res.redirect('/');
});

app.get('/api/authenticated', function(req, res) {
	res.json({
		authenticated: req.isAuthenticated()
	});
});

app.get('/api/delegated-to-accounts', function(req, res) {
	fatNest.getDelegatedToAccounts(req.user.id.toString(), function(err, delegatedToAccounts) {
		if (err) {
			console.error(err);
			return;
		}

		res.json({
			"delegated-to-accounts": delegatedToAccounts
		});
	});
});

app.get('/api/delegated-accounts', function(req, res) {
	fatNest.getDelegatedAccounts(req.user.id.toString(), function(err, delegatedAccounts) {
		if (err) {
			console.error(err);
			return;
		}

		res.json({
			"primary-account": req.user,
			"delegated-accounts": delegatedAccounts
		});
	});

});

var handleRecentTweets = function(req, res) {
	var cb = function(err, tweets) {
		if (err) {
			console.error(err);
			res.json({
				"error" : err,
				"html": null
			});
		} else {
			res.json({
				"error": null,
				"html": tweets.join('\n')
			});
		}
	};

	var user_id = (req.params.id !== undefined) ? req.params.id : req.user.id.toString();
	fatNest.recentTweets(user_id, cb);
};

app.get('/api/recent-tweets/:id', handleRecentTweets);
app.get('/api/recent-tweets', handleRecentTweets);

app.post('/api/new-delegate', function(req, res) {
	fatNest.createDelegate(req.user.id.toString(), req.body.screen_name, function(err, user) {
		res.json({ error: err, success: !err, user: user });
	});
});

app.post('/api/remove-delegate', function(req, res) {
	fatNest.removeDelegate(req.user.id.toString(), req.body.user_id, function(err, result) {
		res.json({ error: err, success: !err && result });
	});
});

app.post('/api/tweet', function(req, res) {
	fatNest.postTweet(req.user.id.toString(), req.body.user_id, req.body.status, function(err, result) {
		if (err === null) {
			res.json({ success: true, tweet_id: result.id });
		} else {
			res.json({ error: err, success: false, tweet_id: null });
		}
	});
});

app.all('/api/*', ensureAuthenticated);

app.get('/dashboard', ensureAuthenticated, function(req, res) {

	var payload = {
		cached_data: true
	};

	delegatedAccountCB = function(err, delegatedAccounts) {
		if (err) {
			console.error(err);
			return;
		}

		payload['/api/delegated-accounts'] = {
				"primary-account": req.user,
				"delegated-accounts": delegatedAccounts
			};
		fatNest.getDelegatedToAccounts(req.user.id.toString(), delegatedToAccountCB);
	};

	delegatedToAccountCB = function(err, delegatedToAccounts) {
		if (err) {
			console.error(err);
			return;
		}

		payload['/api/delegated-to-accounts'] = {
				"delegated-to-accounts": delegatedToAccounts
			}

		fatNest.recentTweets(req.user.id.toString(), recentTweetsCB);
	};

	recentTweetsCB = function(err, tweets) {

		if (err) {
			console.error(err);
			payload['/api/recent-tweets'] = {
				"error" : err,
				"html": null
			};
		} else {
			payload['/api/recent-tweets'] = {
				"error": null,
				"html": tweets.join('\n')
			};
		}

		res.render('index.html', { body_dataset: payload });

	};

	fatNest.getDelegatedAccounts(req.user.id.toString(), delegatedAccountCB);
});

var server = app.listen(3000, function () {
	var host = server.address().address;
	var port = server.address().port;

	console.log('Example app listening at http://%s:%s', host, port);
});


function ensureAuthenticated(req, res, next) {
	if (req.isAuthenticated()) { return next(); }
	res.redirect('/');
}

function allowLocalAccess(req, res, next) {
	if (req.hostname === '127.0.0.1') {
		res.header("Access-Control-Allow-Origin", "http://localhost");
		res.header("Access-Control-Allow-Methods", "GET, POST");
	}
	return next();
}