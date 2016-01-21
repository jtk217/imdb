var imdb = require('../lib/imdb.js');
imdb.title('tt0098904', function(err, episodes) {
	console.log(episodes);	
});