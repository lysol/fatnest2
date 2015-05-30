module.exports = function(grunt) {
	// Project configuration.
	grunt.initConfig({
		jshint: ['*.js', 'public/js/*.js'],
		wiredep: {
			task: {
				src: 'public/index.html'
			},
			options: {
				directory: "public/bower_components"
			}

		}
	});

	grunt.loadNpmTasks('grunt-contrib-jshint');
	grunt.loadNpmTasks('grunt-wiredep');

	grunt.registerTask('default', ['jshint', 'wiredep']);
};