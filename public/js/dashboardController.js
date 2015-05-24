App.controller('dashboardController', ['$scope', '$sce', '$http', '$timeout', function($scope, $sce, $http, $timeout) {
	$scope.tweets = '';
	$scope.draft = '';
	$scope.charCount = 140;
	$scope.primaryAccountID = undefined;
	$scope.delegatedAccounts = [];

	var authenticatedPromise = $http.get("/api/authenticated");

	authenticatedPromise.success(function(data, status, headers, config) {

		if (data.authenticated !== undefined && data.authenticated) {
			var tweetsPromise = $http.get("/api/recent-tweets");

			tweetsPromise.success(function(data, status, headers, config) {
			    $scope.tweets = $sce.trustAsHtml(data.html);
			    $timeout(function () { twttr.widgets.load(); }, 500); 
			});

			var accountsPromise = $http.get("/api/delegated-accounts");

			accountsPromise.success(function(data, status, headers, config) {
				$scope.delegatedAccounts = data['delegated-accounts'];
				$scope.primaryAccountID = data['primary-account-id'];				
			});
		} else {
			$location.path('/');
		}
	});

	$scope.evalTweet = function() {
		$scope.charCount = 140 - twttr.txt.getTweetLength($scope.draft);
	};

}]);