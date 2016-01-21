var imdb = require('../lib/imdb.js');

imdb.episodes('tt0106004', 2, function(err, episodes) {
	console.log(episodes);	
});