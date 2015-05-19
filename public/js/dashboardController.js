App.controller('dashboardController', ['$scope', '$log', '$http', function($scope, $log, $http) {
	var responsePromise = $http.get("/api/dashboard-data");

	$scope.tweets = [];

	responsePromise.success(function(data, status, headers, config) {
	    $scope.tweets = data;
	});
	responsePromise.error(function(data, status, headers, config) {
	    alert("AJAX failed!");
	});
}]);