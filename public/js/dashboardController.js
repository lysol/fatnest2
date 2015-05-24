App.controller('dashboardController', ['$scope', '$sce', '$http', '$timeout', function($scope, $sce, $http, $timeout) {
	$scope.tweets = '';
	$scope.draft = '';
	$scope.charCount = 140;
	$scope.primaryAccountID = undefined;
	$scope.delegatedAccounts = [];

	var authenticatedPromise = $http.get("/api/authenticated");

	authenticatedPromise.success(function(data, status, headers, config) {

		if (data.authenticated !== undefined && data.authenticated) {
			var responsePromise = $http.get("/api/dashboard-data");

			responsePromise.success(function(data, status, headers, config) {
				$scope.delegatedAccounts = data['delegated-accounts'];
			    $scope.tweets = $sce.trustAsHtml(data.html);
			    $scope.primaryAccountID = data['primary-account-id'];
			    $timeout(function () { twttr.widgets.load(); }, 500); 
			});
		} else {
			$location.path('/');
		}
	});

	$scope.evalTweet = function() {
		$scope.charCount = 140 - twttr.txt.getTweetLength($scope.draft);
	};

}]);