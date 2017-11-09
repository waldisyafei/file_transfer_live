var fs			= require('fs')
	, exec		= require('child_process').exec
	, child		= require('child_process')
	, mimetype	= require('mimetype')  
	, express	= require('express')
	, app		= express()
	, server	= require('http').createServer(app)
	, io		= require('socket.io').listen(server)
	, redis		= require('socket.io-redis')
	, db		= require('redis').createClient('6379','127.0.0.1')
	, path		= require('path')
	, router	= express.Router()
	, client	= []
	, Files		= {};

function DownloadFile(req, res){
	try {
		var filestream = fs.createReadStream("./temp/"+req.params.filename);
		var type = mimetype.lookup(req.params.filename);
		res.setHeader('Content-type', type);
		res.setHeader('Content-disposition', 'attachment; filename='+req.params.filename);
		filestream.pipe(res);
	} catch (e) { console.log(e); }
}

router.get('/download/:filename', DownloadFile);
router.get('/', function(req, res){
	res.sendFile(path.join(__dirname + '/index.html'));
});

app.use('/', router);

server.listen(8080, function(){
	console.log('Server is listening port 8080');
});

function handler (req, res) {
	try {
		fs.readFile(__dirname + '/index.html',
		function (err, data) {
			if (err) {
				res.writeHead(500);
				return res.end('Error loading index.html');
			}
			res.writeHead(200);
			res.end(data);
		});
	} catch (e) { console.log(e); }
}

io.sockets.on('connection', function (socket) {
	client.push(socket.id);
	console.log('User connected: ' + socket.id + ' : ' + Object.keys(client).length)

	socket.on('confirm', function(id, idto){
		try {
			db.hget(id, "socketid", function (err,obj){
				if (obj!=null)
				{
					socket.broadcast.to(obj).emit('confirmation', idto);
				}
				else
				{
					socket.emit('nouser');
				}
			})
		} catch (e) { console.log(e); }
	});

	socket.on('confirmation', function(idto, accept){
		try {
			socket.broadcast.to(idto).emit('accept', accept);
		} catch (e) { console.log(e); }
	});
	
	socket.on('getid', function (data) {
		try {
			var randomnumber=Math.floor(Math.random()*1000001);
			
			var data=[];
			var date = new Date();

			db.hset([
				randomnumber, 'socketid', socket.id
			]);
			db.hset([
				randomnumber, 'date', date 
			]);

			socket.emit('setid', randomnumber);
		} catch (e) { console.log(e); }
	});
		
	socket.on('Start', function (data) { 
		try {
			var Name = data['Name'];
			Files[Name] = {  //Create a new Entry in The Files Variable
				FileSize : data['Size'],
				Data	 : "",
				Downloaded : 0
			}
			var Place = 0;
			try{
				var Stat = fs.statSync('temp/' +  Name);
				if(Stat.isFile())
				{
					Files[Name]['Downloaded'] = Stat.size;
					Place = Stat.size / 524288;
				}
			}
	  		catch(er){} //It's a New File
			fs.open("temp/" + Name, 'a', 0755, function(err, fd){
				if(err)
				{
					console.log(err);
				}
				else
				{
					Files[Name]['Handler'] = fd; //We store the file handler so we can write to it later
					socket.emit('MoreData', { 'Place' : Place, Percent : 0 });
					
					socket.broadcast.to(client[1]).emit('TriggerDownload', { 'name' : Name, 'size':	data['Size'], link: 'test'  });

					socket.broadcast.to(client[1]).emit('MoreData', { 'Place' : Place, Percent : 0 });
				}
			});
		} catch (e) { console.log(e); }
	});
	
	socket.on('Upload', function (data){
		try {
			var Name = data['Name'];
			Files[Name]['Downloaded'] += data['Data'].length;
			Files[Name]['Data'] += data['Data'];
			if(Files[Name]['Downloaded'] == Files[Name]['FileSize']) //If File is Fully Uploaded
			{
				fs.write(Files[Name]['Handler'], Files[Name]['Data'], null, 'Binary', function(err, Writen){
					socket.emit('Done', {'Image' : 'temp/' + Name + '.jpg'});
					socket.broadcast.to(client[1]).emit('Doneclient', {'name' : Name });
				});
			}
			else if(Files[Name]['Data'].length > 10485760){ //If the Data Buffer reaches 10MB
				fs.write(Files[Name]['Handler'], Files[Name]['Data'], null, 'Binary', function(err, Writen){
					Files[Name]['Data'] = ""; //Reset The Buffer
					var Place = Files[Name]['Downloaded'] / 524288;
					var Percent = (Files[Name]['Downloaded'] / Files[Name]['FileSize']) * 100;
					socket.emit('MoreData', { 'Place' : Place, 'Percent' :  Percent});
					socket.broadcast.to(client[1]).emit('MoreData', { 'Place' : Place, 'Percent' :  Percent});
				});
			}
			else
			{
				var Place = Files[Name]['Downloaded'] / 524288;
				var Percent = (Files[Name]['Downloaded'] / Files[Name]['FileSize']) * 100;
				socket.emit('MoreData', { 'Place' : Place, 'Percent' :  Percent, 'size': Files[Name]['FileSize'] });
				socket.broadcast.to(client[1]).emit('MoreData', { 'Place' : Place, 'Percent' :  Percent});
			}
		} catch (e) { console.log(e); }
	});
	
	socket.on('disconnect', function(){
		try {
			var i = client.indexOf(socket.id);
			client.splice(i,1);
			console.log('User disconnect: ' + socket.id + ' : ' + Object.keys(client).length)
		} catch (e) { console.log(e); }
	})
});
