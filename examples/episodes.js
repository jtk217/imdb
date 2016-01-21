// get IMDB information on the third season of Frasier
var imdb = require('../lib/imdb.js');

imdb.episodes('tt0106004', 3, function(err, episodes) {
	console.log(episodes);	
});