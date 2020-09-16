import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import knex from 'knex';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';


const __dirname = path.resolve();
const app = express();
app.use(cors());
app.use(bodyParser.urlencoded());
app.use(bodyParser.json());
app.use('/song_images', express.static(path.join(__dirname, 'song_images')));

const db = knex({
    client: 'pg',
    connection: {
    host : '127.0.0.1',
    user : 'raj',
    password : '03052004',
    database : 'Archer'
    }
})

app.post('/register', (req, res) => {
    const {name, email, password} = req.body;
    const hash = bcrypt.hashSync(password, 10);
    let id = uniqueID();
        db.transaction(trx => {
            trx.insert({
                user_id: id, 
                email: email,
                hash: hash
            })
            .into('login')
            .returning('user_id')
            .then(loginId => {
                return trx('users')
                .returning('*')
                .insert({
                    user_id: loginId[0],
                    name: name
                })
                .then(user => {
                    res.json(user[0]);
                })
                .then(trx.commit)
                .catch(trx.rollback)
            })
        })
        .catch(() => res.status(400).send('user name already exists'));
        
})

app.post('/signin', (req, res) => {
    
    db.select('*').from('login')
    .where('email', '=', req.body.email)
    .then(data => {
        const isValid = bcrypt.compareSync(req.body.password, data[0].hash);
        if(isValid) {
            return(
                db.select('*').from('users')
                .where({user_id: data[0].user_id})
                .then(user => {
                    res.status(200).send(user[0]);
                })
                .catch(err => {res.status(400).send('unable to get request')})
            );
        }
        else {
            return res.send('wrong credentials');
        }
    })
    .catch(() => res.send('Invalid user name or password'));
})

app.get('/recent/:user_id', (req, res) => {

    const {user_id} = req.params;
    
    db.select('recents').from('users').where({user_id: user_id})
        .then((recents) => {
            if(recents[0].recents === null)
                res.json([]);
            else {
                res.json(JSON.parse(recents[0].recents));
            }
        })
    .catch(err => console.log(err))
})

app.put('/recent/:user_id', (req, res) => {
    const {user_id} = req.params;
    const {recents} = req.body;
    db('users').where({user_id: user_id}).update({
        recents: recents
    }).returning('recents')
    .then((recent) => {
        res.send((recent[0]));
    })
    .catch(err => console.log(err));
})

app.post('/newplaylist/:user_id', (req, res) => {
    const {user_id} = req.params;
    const {newPlaylistName, newPlaylistSongs} = req.body;
    db.select('playlist').from('users').where({user_id: user_id})
    .then(playlist => {
        let playlists = {...JSON.parse(playlist[0].playlist)};
        if(newPlaylistName === Object.keys(playlists).includes()) {
            res.json('Playlist already exists');
            return;
        }
        playlists[newPlaylistName] = newPlaylistSongs;

        db('users').update({
            playlist: JSON.stringify(playlists)
        }).where({user_id: user_id}).returning('playlist')
        .then(retunedData => {
            res.json(JSON.parse(retunedData[0]))
        })
        .catch(err => res.json(err));
    })
    .catch(err => res.json(err));
})

app.get('/mp3/:id', (req, res) => {
    const {id} = req.params;
    
    db('songs').select('song_url').where({song_id: JSON.parse(id)})
    .then(song => {
        
        var filePath = song[0].song_url;
        var stat = fs.statSync(filePath);
        var total = stat.size;
        if (req.headers.range) {
            var range = req.headers.range;
            var parts = range.replace(/bytes=/, "").split("-");
            var partialstart = parts[0];
            var partialend = parts[1];
    
            var start = parseInt(partialstart, 10);
            var end = partialend ? parseInt(partialend, 10) : total-1;
            var chunksize = (end-start)+1;
            var readStream = fs.createReadStream(filePath, {start: start, end: end});
            res.writeHead(206, {
                'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
                'Accept-Ranges': 'bytes', 'Content-Length': chunksize,
                'Content-Type': 'audio/mp3'
            });
            readStream.pipe(res);
         } else {
            res.writeHead(200, { 'Content-Length': total, 'Content-Type': 'audio/mpeg' });
            fs.createReadStream(filePath).pipe(res);
         }
    })
    .catch(err => console.log(err));
})


app.get('/image/:id', (req, res) => {
    
    let {id} = req.params;
    id = JSON.parse(id);
    
    db('songs').select('song_id', 'song_image', 'song_name').whereIn('song_id', id)
    .then(array => res.send(array))
    .catch(err => console.log(err));
})

app.get('/search/:value', (req, res) => {
    let {value} = req.params;
    value = value.toLowerCase();
    db('search').select('song_id', 'song_image', 'song_name').whereRaw(`LOWER(song_name) like '%${value}%'`).limit(20).orderBy('song_name')
    .then(data => res.json(data))
    .catch(err => res.json(err));
})

app.get('/search_history/:user_id', (req, res) => {

    const {user_id} = req.params;
    
    db.select('search_history').from('users').where({user_id: user_id})
        .then((histories) => {
            if(histories[0].search_history === null)
                res.json([]);
            else {
                res.json(JSON.parse(histories[0].search_history));
            }
        })
    .catch(err => console.log(err))
})

app.put('/search_history/:user_id', (req, res) => {
    const {user_id} = req.params;
    const {histories} = req.body;
    db('users').where({user_id: user_id}).update({
        search_history: histories
    }).returning('search_history')
    .then((histories) => {
        res.send((histories[0]));
    })
    .catch(err => console.log(err));
})

const uniqueID = () => {
    function chr4(){
      return Math.random().toString(16).slice(-4);
    }
    return chr4() + chr4() +
      '-' + chr4() +
      '-' + chr4() +
      '-' + chr4() +
      '-' + chr4() + chr4() + chr4();
}

app.get('/playlist/:userId', (req, res) => {
    const{userId} = req.params;
    db('users').select('playlist').where({user_id: userId})
    .then(playlist => res.send(JSON.parse(playlist[0].playlist)))
    .catch(console.log);
})

app.listen(3002, () => {    
    console.log('app is running on port ', 3002);
});