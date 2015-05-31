var redis = require("redis");
var Twit = require('twit');
var async = require('async');

var method = FatNest.prototype;

function FatNest(config) {
	console.log(config);
	this._config = config;
	this._redisClient = redis.createClient();
	this._twits = {};
	this._userCache = {};
}

method._isNumeric = function(n) {
	return !isNaN(parseFloat(n)) && isFinite(n);
};

method.saveUser = function(token, tokenSecret, profile) {
	var payload = { token: token, tokenSecret: tokenSecret, username: profile.username };
	this._redisClient.hmset(profile.id.toString() + ':keys', payload);
};

method.getTwitterClient = function(id, cb) {

	var getKeysCB = (function(err, obj) {
			if (err === null && obj) {
				this._twits[id] = new Twit({
					consumer_key: this._config.TWITTER_CONSUMER_KEY,
					consumer_secret: this._config.TWITTER_CONSUMER_SECRET,
					access_token: obj.token,
					access_token_secret: obj.tokenSecret
				});
				cb(null, this._twits[id]);
			} else if (err === null && !obj) {
				cb("No API Client recorded for " + id);
			} else {
				cb(err, null);
			}
		}).bind(this);

	if (this._twits[id] === undefined) {
		this._redisClient.hgetall(id.toString() + ':keys', getKeysCB);
	} else {
		cb(null, this._twits[id]);
	}
};

method.tweetEmbed = function(userId, tweet, cb) {

	var newhtml;

	var tweetIDCB = (function(err, html) {
			if (err) {
				cb(err, null);
				return;
			}
	
			if (html === null) {
				this.getTwitterClient(userId, twitterClientCB);
			} else {
				cb(null, html);
			}
		}).bind(this);

	var twitterClientCB = (function(err, twit) {
			if (err) {
				cb(err, null);
				return;
			}
			twit.get('statuses/oembed', { id: tweetId, omit_script: true, hide_thread: true }, oembedCB);
		}).bind(this);

	var oembedCB = (function(err, data, response) {
			if (err) {
				cb(err, null);
				return;
			}
	
			// strip out js.
			newhtml = data.html.replace(this._config.TWITTER_JS, '');
			console.log(data.html);
			this._redisClient.set('tweet_' + tweetId, data.html, setTweetCB);
		}).bind(this);

	var setTweetCB = (function(err) {
			if (err) {
				cb(err, null);
				return;
			}
			cb(null, newhtml);
		}).bind(this);

	var tweetId = tweet.id_str;
	this._redisClient.get('tweet_' + tweetId, tweetIDCB);
};


method.tweetEmbedClosure = function(userId) {
	return (function(tweetId, cb) {
			return this.tweetEmbed(userId, tweetId, cb);
		}).bind(this);
};

method.getUserCached = function(clientId, userId, callback) {

	var twitterClientCB = (function(err, twit) {
			if (err) {
				callback(err, null);
				return;
			}
	
			if (this._userCache[userId] !== undefined) {
				callback(null, this._userCache[userId]);
				return;
			}
	
			var data = {};
	
			if (this._isNumeric(userId)) {
				data.user_id = userId;
			} else {
				data.screen_name = userId;
			}
	
			twit.get('users/show', data, showCB);
		}).bind(this);

	var showCB = (function(err, user) {
			this._userCache[userId] = user;
			callback(null, user);
			return;
		}).bind(this);

	this.getTwitterClient(clientId, twitterClientCB);
};

method.getTwitterUsersForIDs = function(clientId, userIDs, callback) {
	var mapper = (function(twitterId, cb) {
			twitterId = twitterId.toString();

			var closure = function(err, user) {
				if (err) {
					cb(err, null);
				} else {
					cb(null, user);
				}
			};

			this.getUserCached(clientId, twitterId, closure);
		}).bind(this);

	var closureCB = (function(err, twitterUsers) {
			if (err) {
				callback(err,  null);
				return;
			}
	
			callback(null, twitterUsers);
		}).bind(this);

	async.map(userIDs, mapper, closureCB);
};

method.getDelegatedToAccounts = function(userId, callback) {

	var delegatesCB = (function(err, twitter_ids) {
			if (err) {
				callback(err, null);
				return;
			}
	
			this.getTwitterUsersForIDs(userId, twitter_ids, usersCB);			
		}).bind(this);

	var usersCB = (function(err, users) {
			if (err) {
				callback(err, null);
				return;
			}
	
			callback(null, users);
		}).bind(this);

	this._redisClient.smembers(userId + ':delegated-to', delegatesCB);
};

method.getDelegatedAccounts = function(userId, callback) {

	var tempUsers;

	var delegatedCB = (function(err, twitter_ids) {
			if (err) {
				callback(err, null);
				return;
			}
	
			this.getTwitterUsersForIDs(userId, twitter_ids, twitterUsersCB);
		}).bind(this);

	var twitterUsersCB = (function(err, users) {
			if (err) {
				callback(err, null);
				return;
			}
			tempUsers = users;
			this.getUserCached(userId, userId, cachedUserCB);
		}).bind(this);

	var cachedUserCB = (function(err, user) {
			if (err) {
				callback(err, null);
				return;
			}
			tempUsers.push(user);
			callback(null, tempUsers);
		}).bind(this);

	this._redisClient.smembers(userId + ':delegated', delegatedCB);
};

method.removeDelegate = function(userId, targetUserId, callback) {

	var delegatedCB = (function(err, res) {
			if (err) {
				callback(err, undefined);
				return;
			}
	
			this._redisClient.srem(targetUserId + ':delegated', userId, removedCB);
		}).bind(this);

	var removedCB = (function(err, res) {
			if (err) {
				callback(err, undefined);
				return;
			}
	
			callback(undefined, true);
		}).bind(this);

	this._redisClient.srem(userId + ':delegated-to', targetUserId, delegatedCB);
};

method.createDelegate = function(userId, screenName, callback) {

	var delegateUser;

	var cachedUserCB = (function(err, user) {
			delegateUser = user;
			console.log(user);
			if (err) {
				callback(err, undefined);
				return;
			}
			this._redisClient.sadd(userId + ':delegated-to', delegateUser.id, delegatedCB);
		}).bind(this);

	var delegatedCB = (function(err, res) {
			if (err) {
				callback(err, undefined);
				return;
			}
			this._redisClient.sadd(delegateUser.id + ':delegated', userId, addedCB);
		}).bind(this);

	var addedCB = (function(err, res) {
			if (err) {
				callback(err, undefined);
				return;
			}
			callback(undefined, delegateUser);
		}).bind(this);

	this.getUserCached(userId, screenName, cachedUserCB);
};

// returns html
method.recentTweets = function(user_id, callback) {

    var getClientCallback = (function(err, twit) {
    		if (err === null) {
    			twit.get('statuses/user_timeline', { count: 5, user_id: user_id }, timelineCallback);
    		} else {
    			console.error(err);
    		}
    	}).bind(this);

	var timelineCallback = (function(err, data, response) {
			var closure = this.tweetEmbedClosure(user_id);
	
			async.map(data, closure, callback);
		}).bind(this);

	this.getTwitterClient(user_id, getClientCallback);
};

method.postTweet = function(authorId, postAsID, tweetBody, callback) {

	// TODO ensure the posting account has a delegation

	var getDelegatedCB = (function(err, users) {
	
			var found = false;
	
			for(var u in users) {
				console.log(users[u], postAsID);
				if (postAsID == users[u].id) {
					found = true;
					break;
				}
			}
	
			if (found) this.getTwitterClient(postAsID, getClientCallback)
				else callback("Access denied", null);
		}).bind(this);

	var tweetCallback = (function(err, data, response) {
			if (err === null) {
				callback(null, data);
			} else {
				callback(err, null);
			}
		}).bind(this);

	var getClientCallback = (function(err, twit) {
			if (err === null) {
				twit.post('statuses/update', { status: tweetBody }, tweetCallback);
			} else {
				console.error(err);
				callback(err, null);
			}
		}).bind(this);


	this.getDelegatedAccounts(authorId, getDelegatedCB);

};


module.exports = FatNest;