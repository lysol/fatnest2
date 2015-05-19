App.controller('dashboardController', ['$scope', '$sce', '$http', function($scope, $sce, $http) {
	$scope.tweets = '';

	var authenticatedPromise = $http.get("/api/authenticated");

	authenticatedPromise.success(function(data, status, headers, config) {

		if (data.authenticated !== undefined && data.authenticated) {
			var responsePromise = $http.get("/api/dashboard-data");

			responsePromise.success(function(data, status, headers, config) {
			    $scope.tweets = $sce.trustAsHtml(data.html);
			});
		} else {
			$location.path('/');
		}
	});

}]);