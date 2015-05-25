App.controller('dashboardController', ['$scope', '$sce', '$http', '$timeout', function($scope, $sce, $http, $timeout) {
	$scope.tweets = '';
	$scope.draft = '';
	$scope.charCount = 140;
	$scope.primaryAccountID = undefined;
	$scope.delegatedAccounts = [];
	$scope.delegatedToAccounts = [];
	$scope.newDelegate = '';

	var authenticatedPromise = $http.get("/api/authenticated");

	authenticatedPromise.success(function(data, status, headers, config) {

		if (data.authenticated !== undefined && data.authenticated) {
			var tweetsPromise = $http.get("/api/recent-tweets");

			tweetsPromise.success(function(data, status, headers, config) {
			    $scope.tweets = $sce.trustAsHtml(data.html);
			    $timeout(function () { twttr.widgets.load(); }, 500); 
			});

			var delegatedFromPromise = $http.get("/api/delegated-accounts");

			delegatedFromPromise.success(function(data, status, headers, config) {
				$scope.delegatedAccounts = data['delegated-accounts'];
				$scope.primaryAccountID = data['primary-account-id'];				
			});

			var delegatedToPromise = $http.get("/api/delegated-to-accounts");

			delegatedToPromise.success(function(data, status, headers, config) {
				$scope.delegatedToAccounts = data['delegated-to-accounts'];
			});
		} else {
			$location.path('/');
		}
	});

	$scope.evalTweet = function() {
		$scope.charCount = 140 - twttr.txt.getTweetLength($scope.draft);
	};

	$scope.checkDelegate = function() {
		newDelegatePromise = $http.post("/api/new-delegate", { screen_name: $scope.newDelegate });

		newDelegatePromise.success(function(data, status, headers, config) {
			if (data.success !== undefined && data.success) {
				$scope.delegatedToAccounts.push(data.newDelegate);
			}
		});
	};

	$scope.removeDelegate = function(user_id) {
		deleteDelegatePromise = $http.post("/api/remove-delegate", { user_id: user_id });

		deleteDelegatePromise.success(function(data, status, headers, config) {
			if (data.success !== undefined && data.success) {
				$scope.delegatedToAccounts = $scope.delegatedAccounts.filter(function(item) {
					return item.id !== user_id;
				});
			}
		});
	};
}]);