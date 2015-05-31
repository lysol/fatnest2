var App = angular.module('fatnest', ['ngRoute', 'ngMessages'])
	.config(['$routeProvider', '$locationProvider', 
	function($routeProvider, $locationProvider) {

		$routeProvider
			.when('/dashboard', {
				templateUrl: 'templates/dashboard.html',
				controller: 'dashboardController',
				controllerAs: 'dashboard'
			})
			.when('/', {
				templateUrl: 'templates/home.html',
				controller: 'homeController',
				controllerAs: 'home'
			});

		$locationProvider.html5Mode(true);
	}]);