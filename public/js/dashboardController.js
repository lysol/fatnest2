/**
 * @ngdoc controller
 * @name dashboardController
 * @description  The controller for the dashboard view of the site.
 * @param  {object} $scope         
 * @param  {object} $sce           
 * @param  {object} $http          
 * @param  {object} $timeout       
 * @param  {object} $document
 * @param  {function} controller
 */
App.controller('dashboardController', ['$scope', '$sce', '$http', '$timeout', '$document', 'resourceCache', 
	function($scope, $sce, $http, $timeout, $document, resourceCache) {
		$scope.tweets = '';
		$scope.draft = '';
		$scope.charCount = 140;
		$scope.primaryAccount = undefined;
		$scope.delegatedAccounts = [];
		$scope.delegatedToAccounts = [];
		$scope.newDelegate = '';
		$scope.selectedAccount = '';
		$scope.tweetsLoading = false;
		$scope._boundTwttr = false;

		/**
		 * @description Determine if the account in question is the selected account
		 * @memberof dashboardController
		 * @param  {object} user The user in question
		 * @return {boolean}      
		 */
		$scope.accountIsSelected = function(user) {
			return $scope.selectedAccount.id.toString() === user.id.toString();
		};

		/**
		 * @description Make an account the selected account to do things as
		 * @memberOf dashboardController
		 * @param  {object} user The user in question
		 */
		$scope.selectAccount = function(user) {
			if ($scope.selectedAccount.id.toString() === user.id.toString()) {
				return;
			}
			$scope.selectedAccount = user;
			$scope.refreshTweets();
		};	

		/**
		 * @description  Refresh the recent tweets column, most likely after changing the selected account
		 * @memberOf dashboardController
		 */
		$scope.refreshTweets = function() {
			$scope.tweetsLoading = true;
			var endPoint = ($scope.selectedAccount) ? 
				'/api/recent-tweets/' + $scope.selectedAccount.id :
				'/api/recent-tweets';

			var tweetsPromise = $http.get(endPoint, { cache: resourceCache });

			tweetsPromise.success(function(data, status, headers, config) {
			    $scope.tweets = $sce.trustAsHtml(data.html);
			    $timeout(function () { 
			    	if (!$scope._boundTwttr) {
			    		twttr.events.bind('loaded', function (event) { 
			    			$scope.tweetsLoading = false;
			    			$scope.$apply();
			    		});
			    		$scope._boundTwttr = true;
			    	}

					twttr.widgets.load(document.getElementById("tweet-container")); 
			    }, 300); 
			});
		};

		/**
		 * @description  Check if a prospective tweet is valid, based on calculated character count
		 * @memberof dashboardController
		 * @return {boolean}
		 */
		$scope.checkTweet = function() {
			return $scope.charCount > 0 && $scope.charCount !== 140;
		};

		/**
		 * @description Calculate the tweet length and return if it's valid
		 * @memberOf dashboardController
		 * @return {boolean}
		 */
		$scope.evalTweet = function() {
			$scope.charCount = 140 - twttr.txt.getTweetLength($scope.draft);
			return $scope.checkTweet();
		};

		/**
		 * @description Determine if the user is not already a delegate, is a valid Twitter user,
		 *              and then add them as a new delegate if so
		 * @memberOf dashboardController
		 */
		$scope.checkDelegate = function() {
			var screenNames = $scope.delegatedToAccounts.map(function(item, val) {
				return item.screen_name.toLowerCase();
			});

			if (screenNames.indexOf($scope.newDelegate.toLowerCase()) != -1) {
				$scope.newDelegateForm.newDelegate.$error = { duplicate: true };
				return;
			}

			if ($scope.newDelegateForm.$valid && screenNames.indexOf($scope.newDelegate) == -1) {

				newDelegatePromise = $http.post("/api/new-delegate", { screen_name: $scope.newDelegate });

				newDelegatePromise.success(function(data, status, headers, config) {
					if (data.success !== undefined && data.success) {
						$scope.delegatedToAccounts.push(data.user);
						$scope.newDelegate = '';
						$scope.newDelegateForm.$setPristine();
						$scope.newDelegateForm.$setUntouched();
					}
				});
			}

		};

		/**
		 * @description  Remove a delegated account from being able to tweet as this account
		 * @memberOf dashboardController
		 * @param  {string} user_id The user to remove
		 * @return {boolean}         Success
		 */
		$scope.removeDelegate = function(user_id) {
			deleteDelegatePromise = $http.post("/api/remove-delegate", { user_id: user_id });

			deleteDelegatePromise.success(function(data, status, headers, config) {
				if (data.success !== undefined && data.success) {
					$scope.delegatedToAccounts = $scope.delegatedToAccounts.filter(function(item) {
						return item.id !== user_id;
					});
				}
			});
		};

		/**
		 * @description  Tweet! Uses $scope.draft as the tweet body.
		 * @memberOf dashboardController
		 */
		$scope.tweet = function() {
			tweetPromise = $http.post("/api/tweet", { user_id: $scope.selectedAccount.id, status: $scope.draft });

			tweetPromise.success(function(data, status, headers, config) {
				if (data.success !== undefined && data.success) {
					$scope.refreshTweets();
				}
			});
		};


		var authenticatedPromise = $http.get("/api/authenticated");
		authenticatedPromise.success(function(data, status, headers, config) {

			if (data.authenticated !== undefined && data.authenticated) {
				$scope.refreshTweets();

				var delegatedFromPromise = $http.get("/api/delegated-accounts", { cache: resourceCache });

				delegatedFromPromise.success(function(data, status, headers, config) {
					$scope.delegatedAccounts = data['delegated-accounts'];
					$scope.primaryAccount = data['primary-account'];	
					$scope.selectedAccount = $scope.primaryAccount;
				});

				var delegatedToPromise = $http.get("/api/delegated-to-accounts", { cache: resourceCache });

				delegatedToPromise.success(function(data, status, headers, config) {
					$scope.delegatedToAccounts = data['delegated-to-accounts'];
				});
			} else {
				$location.path('/');
			}
		});
	}
]);