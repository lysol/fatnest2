App.controller('dashboardController', ['$scope', '$log', '$http', function($scope, $log, $http) {
	$scope.tweets = [];

	var authenticatedPromise = $http.get("/api/authenticated");

	authenticatedPromise.success(function(data, status, headers, config) {

		if (data.authenticated !== undefined && data.authenticated) {
			var responsePromise = $http.get("/api/dashboard-data");

			responsePromise.success(function(data, status, headers, config) {
			    $scope.tweets = data;
			});
		} else {
			$location.path('/');
		}
	});

}]);