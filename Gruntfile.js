module.exports = function(grunt) {
	// Project configuration.
	grunt.initConfig({
		jshint: ['*.js', 'public/js/*.js'],
		wiredep: {
			task: {
				src: 'views/index.html',
				fileTypes: {
					html: {
						detect: {
							less: /<link.*href=['"]([^'"]+.less)/gi,
							css: /<link.*href=['"]([^'"]+.css)/gi,
						},
						replace: {
							js: function(filePath) {
								return '<script src="' + filePath.replace('../public/', '') + '"></script>';
							},
							css: function(filePath) {
								return '<link rel="stylesheet" href="' + filePath.replace('../public/', '') + '" />';
							},
							less: function(filePath) {
								return '<link rel="stylesheet/less" href="' + filePath.replace('../public/', '') + '" />';
							}

						}
					}
				}
			},
			options: {
				directory: "public/bower_components"
			}
		},
		jsdoc : {
		        dist : {
		            src: ['fatnest.js', 'app.js', 'public/js/*.js'],
		            options: {
		                destination: 'doc'
		            }
		        }
		    }

	});

	grunt.loadNpmTasks('grunt-contrib-jshint');
	grunt.loadNpmTasks('grunt-wiredep');
	grunt.loadNpmTasks('grunt-jsdoc');

	grunt.registerTask('default', ['jshint', 'wiredep', 'jsdoc']);
};
