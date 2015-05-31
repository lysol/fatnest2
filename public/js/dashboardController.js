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

		var authenticatedPromise = $http.get("/api/authenticated");

		$scope._boundTwttr = false;

		$scope.accountIsSelected = function(user) {
			return $scope.selectedAccount.id.toString() === user.id.toString();
		};

		$scope.selectAccount = function(user) {
			$scope.selectedAccount = user;
			$scope.refreshTweets();
		};	

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

		$scope.checkTweet = function() {
			return $scope.charCount > 0 && $scope.charCount !== 140;
		};

		$scope.evalTweet = function() {
			$scope.charCount = 140 - twttr.txt.getTweetLength($scope.draft);
			return $scope.checkTweet();
		};

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

		$scope.tweet = function() {
			tweetPromise = $http.post("/api/tweet", { user_id: $scope.selectedAccount.id, status: $scope.draft });

			tweetPromise.success(function(data, status, headers, config) {
				if (data.success !== undefined && data.success) {
					$scope.refreshTweets();
				}
			});
		};
	}
]);