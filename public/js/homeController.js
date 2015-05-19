App.controller('homeController', ['$scope', '$http', '$location', function($scope, $http, $location) {

	var authenticatedPromise = $http.get("/api/authenticated");

	authenticatedPromise.success(function(data, status, headers, config) {

		if (data.authenticated !== undefined && data.authenticated) {
			$location.path('/dashboard');
		}
	});
}]);