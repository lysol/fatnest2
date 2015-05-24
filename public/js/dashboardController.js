App.controller('dashboardController', ['$scope', '$sce', '$http', '$timeout', function($scope, $sce, $http, $timeout) {
	$scope.tweets = '';

	var authenticatedPromise = $http.get("/api/authenticated");

	authenticatedPromise.success(function(data, status, headers, config) {

		if (data.authenticated !== undefined && data.authenticated) {
			var responsePromise = $http.get("/api/dashboard-data");

			responsePromise.success(function(data, status, headers, config) {
			    $scope.tweets = $sce.trustAsHtml(data.html);
			    $timeout(function () { twttr.widgets.load(); }, 500); 
			});
		} else {
			$location.path('/');
		}
	});

}]);