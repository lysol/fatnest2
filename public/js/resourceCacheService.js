App
	.factory("resourceCache",["$cacheFactory",
		function($cacheFactory) { 
			return $cacheFactory("resourceCache"); 
		}])
	.directive("preloadBody", ["resourceCache", "$document", 
		function(resourceCache, $document) {
			var linkFunction = function (scope, element, attrs) {
				var preloadData = angular.fromJson(attrs.preloadBody);
				for(var k in preloadData) {
					if (preloadData.hasOwnProperty(k)) {
						resourceCache.put(k, preloadData[k]);
					}
				}
			};

			return { link: linkFunction };
			}
		]);