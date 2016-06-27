var config = require("./config");
config.serverURI = (config.serverURI.indexOf("?") == -1 ? config.serverURI + "?" : config.serverURI + "&");
var inspect = require('eyes').inspector();



/////////////////
// TEAMSPEAK 3 //
/////////////////

var TeamSpeakClient = require("node-teamspeak");

//Connect
var client = new TeamSpeakClient(config.serverHost, config.serverPort);
var servername = "";

//Login
client.send("login", {
    client_login_name: config.loginName,
    client_login_password: config.loginPass
}, function(err, response, rawResponse) {
    if (err) { console.log("An error occured while connecting to the server at '" + config.serverHost + ":" + config.serverPort + "':", err); process.exit(1); return; }

    //Get Virtual Server Information
    client.send("serverlist", {sid: config.serverVirt}, function(err, response, rawResponse) {
        if (err) { console.log("An error occured while connecting to the virtual server #" + config.serverVirt + ":", err); process.exit(1); return; }
        if (!Array.isArray(response)) response = [response];

        for (var i = 0; i < response.length; i++)
            if (response[i].virtualserver_id == config.serverVirt) servername = response[i].virtualserver_name;
    });

    //Select Virtual Server
    client.send("use", {sid: config.serverVirt}, function(err, response, rawResponse) {
        if (err) { console.log("An error occured while connecting to the virtual server #" + config.serverVirt + ":", err); process.exit(1); return; }
        statusLoop();
    });
});

//Update user list
var channels = {};
var users = {};
function statusLoop() {
    //1: LIST CHANNELS
    client.send("channellist", ["topic"], function(err, response, rawResponse) {
        if (err) return error(err);
        if (!Array.isArray(response)) response = [response];

        var cn = {};
        //Add all channels to cn
        for (var i = 0; i < response.length; i++) {
            cn[response[i].cid] = {
                name: response[i].channel_name,
                topic: response[i].channel_topic,
                parent: response[i].pid,
                order: response[i].channel_order,
                children: []
            };
        }

        //Move children to their parent channel
        var children = [];
        for (i in cn) if (cn.hasOwnProperty(i) && cn[i].parent != 0) //Link children
            cn[cn[i].parent].children.push(i);
        for (i in cn) if (cn.hasOwnProperty(i) && cn[i].children.length != 0) //Write children
            cn[i].children = resolveChildren(cn, cn[i].children);

        channels = cn; //Update channels to new value.

        //2: LIST USERS
        client.send("clientlist", ["voice"], function(err, response, rawResponse) {
            if (err) return error(err);
            if (!Array.isArray(response)) response = [response];

            var un = {};
            //Add all users (by channel) to un.
            for (var i = 0; i < response.length; i++) if (response[i].client_type == 0) {
                if (un[response[i].cid] == undefined) un[response[i].cid] = [];
                un[response[i].cid].push({
                    clid: response[i].clid,
                    name: response[i].client_nickname,
                    talking: response[i].client_flag_talking != 0,
                    muted: (response[i].client_input_muted + response[i].client_output_muted + 1 - response[i].client_input_hardware + 1 - response[i].client_output_hardware) > 0,
                    talkpower: response[i].client_talk_power
                });
            }

            for (i in un) un[i].sort(function(a,b) {
                if (a.talkpower != b.talkpower) return a.talkpower > b.talkpower ? -1 : 1;
                else return String.prototype.localeCompare(a, b);
            });
            users = un; //Update users to new value.

            //debugOutput(channels, 0);
            //process.exit(0);
            setTimeout(statusLoop, 200);
        });
    });
}

function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
function error(err) {
    console.log("An error occured:", err);
    process.exit(1);
    return null;
}

function resolveChildren(channels, children) {
    var childrenResolved = {};
    for (i in children) if (children.hasOwnProperty(i) && parseInt(children[i]) != NaN) {
        var childID = children[i];
        channels[childID].children = resolveChildren(channels, channels[childID].children);
        childrenResolved[childID] = channels[childID];
        delete channels[childID];
    }
    return childrenResolved;
}

function getOrder(channels) {
    var unordered = {};
    for (i in channels) if (channels.hasOwnProperty(i)) {
        unordered[i] = channels[i].order; //i: channel ID, channels[i].order: last channel
    }
    //Add next item piece by piece
    var ordered = []; var current = 0;
    for (i in unordered) if (unordered.hasOwnProperty(i)) {
        ordered.push(getOrderNext(current, unordered));
        current = ordered[ordered.length - 1];
    }
    return ordered;
}
function getOrderNext(current, list) {
    for (i in list) if (list[i] == current) return i;
}

function outputTextC(channels, indent) {
    var ind = ""; if (indent) for (var i = 0; i < indent; i++) ind += "    ";
    var output = "";
    var o = getOrder(channels);
    for (var i = 0; i < o.length; i++) { //For all channels
        output += ind + channels[o[i]].name + "\n"; //Print channel name
        if (users[o[i]] != undefined) for (var j = 0; j < users[o[i]].length; j++) //Print users in channel
            output += ind + "» " + (users[o[i]][j].muted ? "M " : (users[o[i]][j].talking ? "T " : "  ")) + users[o[i]][j].name + "\n";
        output += outputTextC(channels[o[i]].children, indent + 1);
    }
    return output;
}
function outputText() {
    return servername + "\n" + outputTextC(channels, 1);
}
function outputJSONC(channels) {
    var output = [];
    var o = getOrder(channels);
    for (var i = 0; i < o.length; i++) { //For all channels
        var n = output.push({
            name: channels[o[i]].name,
            users: [],
            subchannels: []
        }) - 1; //Print channel name
        if (users[o[i]] != undefined) for (var j = 0; j < users[o[i]].length; j++) //Print users in channel
            output[n].users.push({
                name: users[o[i]][j].name,
                talking: users[o[i]][j].talking,
                muted: users[o[i]][j].muted
            });
        output[n].subchannels = outputJSONC(channels[o[i]].children);
    }
    return output;
}
function outputJSON() {
    return JSON.stringify({
        name: servername,
        users: [],
        subchannels: outputJSONC(channels)
    });
}
function outputHTMLC(channels) {
    var output = "";
    var o = getOrder(channels);
    for (var i = 0; i < o.length; i++) { //For all channels
        if (channels[o[i]].name.match(/^\[.?spacer[0-9]*\].*$/) != null) { output += '<a class="seperator"></a>'; continue; }
        var channeluri = encodeURI(config.serverURI + "channel=" + encodeURIComponent(channels[o[i]].name))
        output += '<a class="channel" href="' + channeluri + '">' + channels[o[i]].name + '</a>'; //Print channel name
        if (users[o[i]] != undefined) for (var j = 0; j < users[o[i]].length; j++) //Print users in channel
            output += '<a class="user' + (users[o[i]][j].talking ? " talking" : (users[o[i]][j].muted ? " muted" : "")) + '">' + users[o[i]][j].name + '</a>';
        if (Object.getOwnPropertyNames(channels[o[i]].children).length > 0) {
            output += '<div class="indent">';
            output += outputHTMLC(channels[o[i]].children);
            output += '</div>';
        }
    }
    return output;
}
function outputHTML() {
    return '<a class="server" href="' + config.serverURI + '">' + servername + '</a><div class="indent">' + outputHTMLC(channels) + '</div>';
}



///////////////
// WEBSERVER //
///////////////

var fs = require("fs"); var path = require("path");
var Handlebars = require("handlebars");
var md = require("node-markdown").Markdown;
var express = require("express");
var app = express();

app.get('/', function (req, res) {
    res.redirect(301, "/status");
});
app.get('/api/html', function (req, res) {
    res.type("text/html").send(outputHTML());
});
app.get('/api/text', function (req, res) {
    res.type("text/plain").send(outputText());
});
app.get('/api/json', function (req, res) {
    res.type("application/json").send(outputJSON());
});

app.use(function(req, res){
    if (req.path.match('^(?:[a-zA-Z0-9-_/]*\.?)*$') && fs.existsSync(path.resolve("./web" + req.path + ".hbs"))) {
        var template = Handlebars.compile(fs.readFileSync(path.resolve("./web" + req.path + ".hbs")).toString());
        var data = { title: config.title, description: md(fs.readFileSync("./description.md").toString()) };
        res.type("text/html").send(template(data));
    } else if (req.path.match('^(?:[a-zA-Z0-9-_/]*\.?)*$') && fs.existsSync(path.resolve("./web" + req.path))) {
        res.sendfile(path.resolve("./web" + req.path));
    } else res.status(404).end();
});

var server = app.listen(config.webPort, function () {

    var host = server.address().address;
    var port = server.address().port;

    console.log('Webserver listening at http://%s:%s', host, port);

});
