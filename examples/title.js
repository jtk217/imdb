// get IMDB information on the show Frasier
var imdb = require('../lib/imdb.js');

imdb.title('tt0106004', function(err, episodes) {
	console.log(episodes);	
});