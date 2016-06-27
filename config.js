//Available URLs:
//  http://serverip:webPort/(|index.html|index.php|index.htm|status/) - 301 redirect to http://serverip:webPort/status
//  http://serverip:webPort/status - Main status page with title and description
//  http://serverip:webPort/embed/ - 301 redirect to http://serverip:webPort/embed
//  http://serverip:webPort/embed - Version for iFrames

module.exports = {
//Configuration file for TS3-Status

    serverHost: "127.0.0.1",  //TeamSpeak Server Hostname
    serverPort: 10011,        //TeamSpeak ServerQuery port
    serverVirt: 1,            //Use Virtual Server with SID 1
    serverURI:  "ts3server://example.org",  //TeamSpeak Server Hostname

    loginName: "serveradmin", //ServerQuery Username
    loginPass: "12345678",    //ServerQuery Password

    webPort: 8008,
    title: "Example TS3-Server"

}
