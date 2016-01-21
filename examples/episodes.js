var imdb = require('../lib/imdb.js');
imdb.episodes('tt0098904', 2, function(err, episodes) {
	console.log(episodes);	
});