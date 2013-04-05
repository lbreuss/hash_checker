/*

md5rehasher (named MD5 Reborned Hasher to public) can generate and
check the digest of firefox downloads.
Copyright (C) 2009  Javier Alfonso Bellota de Frutos

This file is part of md5rehasher.

md5rehasher is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

md5rehasher is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with md5rehasher.  If not, see <http://www.gnu.org/licenses/>.

*/

if(!es) var es={};
if(!es.md5rehasher) es.md5rehasher={};
if(!es.md5rehasher.checkDigestDialog) es.md5rehasher.checkDigestDialog={};
es.md5rehasher.checkDigestDialog = {

	downloadId : undefined,
	downloadPath : undefined,
	digestUrl : undefined,
	background : undefined,
	main : undefined,
	_keepRunning : undefined,
	_progressBar : undefined,
	_cryptoHash : undefined,
	_istream : undefined,
	_remaining : 0,
	_timer : undefined,
	

	// this tells updateFromStream to read the entire file
	//NEXT_CHUNK_SIZE : 0xffffffff,
	NEXT_CHUNK_SIZE : 0x00ffffff, //Really the value is read from preferences 
	
	// This is the time to wait from chunk to chunk (in miliseconds).
	delayTime : 100,//Really the value is read from preferences

	init: function(){
		// Initialization code
		this.initialized = true;
		this.downloadId = downloadId;
		this.downloadPath = file.path;
		this.digestUrl = remotefileurl + ".md5"; // first guess
		// Set the path label text.
		document.getElementById("path").setAttribute("value", file.path);
		document.getElementById("fileUrlLabel").setAttribute("value", remotefileurl);
		document.getElementById("digestUrlTextbox").setAttribute("value", this.digestUrl);

		this.strings = document.getElementById("downloadlogger-strings");

		// Open the data base, setting the file directory in the user profile.
		this.initDbFile();
		
		// Load the digest (if it was set before).
		this.loadDigest();
		
		this._keepRunning = false;
	},
	
	initDbFile: function(){
		this.dbFile = Components.classes["@mozilla.org/file/directory_service;1"]
		  .getService(Components.interfaces.nsIProperties)
		  .get("ProfD", Components.interfaces.nsIFile);
		this.dbFile.append("digests.sqlite");

			// Accede al servicio de almacenamiento y abre la base de datos
		this.storageService = Components.classes["@mozilla.org/storage/service;1"]
		  .getService(Components.interfaces.mozIStorageService);
   
		// Check if the file exists
		if (!this.dbFile.exists()) {
			var dbConn = this.storageService.openDatabase(this.dbFile);
			dbConn.executeSimpleSQL("CREATE TABLE digests (dlid INTEGER PRIMARY KEY, source TEXT, digesttype TEXT," +
						      " digest TEXT)");
			dbConn.close();
		}
	},
	
	loadDigest: function(){
		// Read from BD
		var dbConn = this.storageService.openDatabase(this.dbFile);
		var statement = dbConn.createStatement("SELECT * FROM digests WHERE dlid=?1 AND source=?2");
		statement.bindStringParameter(0, this.downloadId);
		statement.bindStringParameter(1, this.downloadPath);
		try{
			// Get only the first (if it exist)
			if (statement.executeStep()){
				// Get the info
				document.getElementById("HashAlgo").selectedItem = document.getElementById(
				  statement.getString(2)+"label");
				document.getElementById("expectedDigest").value = statement.getString(3);
				//this.calculateDigest();
			}
		} finally {
			statement.reset();
			statement.finalize();
			dbConn.close();
		}
	},

	/**
	 * This function is called when the expected digest changes, or the calculation of the file digest finishes.
	 * 
	 */
	compareDigests: function() {
		// If it's calculating, don't change anything.
		if (this._keepRunning) {
			return;
		}
		var strbundle = document.getElementById("checkDigestDialogStrings");
		var expectedDigest = document.getElementById("expectedDigest").value;
		var calculatedDigest = document.getElementById("calculatedDigest").getAttribute("value");

		/* Vivek Athalye: Changes start */
		expectedDigest = expectedDigest.replace(/\s/g, ''); // remove all whitespace characters
		if(expectedDigest == "") { // user has not entered anything in the textfield yet
			// so no need to check anything for now.
			document.getElementById("result").setAttribute("value", strbundle.getString("checkDigestDialog.unspecified"));
			document.getElementById("result").setAttribute("style", "text-align:center;font-size:large;font-weight:bold; color: blue");
			return;
		}

		if(calculatedDigest == "") { // not digest have been generated yet so not need to check.
			// so no need to check anything for now.
			document.getElementById("result").setAttribute("value", strbundle.getString("checkDigestDialog.notGenerated"));
			document.getElementById("result").setAttribute("style", "text-align:center;font-size:large;font-weight:bold; color: blue");
			return;
		}

		expectedDigest = expectedDigest.toUpperCase(); // convert both values to upper case
		calculatedDigest = calculatedDigest.toUpperCase(); // so that the comparison becomes case insensitive. 
		/* Vivek Athalye: Changes end */

		if (calculatedDigest == expectedDigest) {
			document.getElementById("result").setAttribute("value", strbundle.getString("checkDigestDialog.OK"));
			document.getElementById("result").setAttribute("style", "text-align:center;font-size:large;font-weight:bold; color: green");
		} else {
			document.getElementById("result").setAttribute("value", strbundle.getString("checkDigestDialog.Failed"));
			document.getElementById("result").setAttribute("style", "text-align:center;font-size:large;font-weight:bold; color: red");
		}
	},

	
	//-------------------------------------------------------------------------------------------
	/**
	 * This function start the calculation of a hash.
	 */
	calculateDigest: function() {
		if (this._keepRunning == true) {
			// We are running a hash, stop it.
			this.doCancel();
		} else {
			this._keepRunning = true;
	
			// Update the status label
			var strbundle = document.getElementById("checkDigestDialogStrings");
			document.getElementById("result").setAttribute("value", strbundle.getString("checkDigestDialog.generatingDigest"));
			document.getElementById("result").setAttribute("style", "text-align:center;font-size:large;font-weight:bold; color: blue");
			// Show the progress bar.
			this._progressBar = document.getElementById("progressBar");
			this._progressBar.hidden = false;
			
			// Change the start button to stop button
			var btnStart = document.getElementById("calcDigest");
			btnStart.setAttribute("label", strbundle.getString("checkDigestDialog.stop"));

			// Read the preference values for interval and chunk size
			// Get the "extensions.md5rehasher@phoneixs.es." branch
			var prefs = Components.classes["@mozilla.org/preferences-service;1"]
			                    .getService(Components.interfaces.nsIPrefService);
			prefs = prefs.getBranch("extensions.md5rehasher@phoneixs.es.");
			this.NEXT_CHUNK_SIZE = prefs.getIntPref("chunkSize");
			this.delayTime = prefs.getIntPref("interval");

			this._istream = Components.classes["@mozilla.org/network/file-input-stream;1"]           
			                        .createInstance(Components.interfaces.nsIFileInputStream);
			
			// open for reading
			this._istream.init(file, 0x01, 0444, 0);
			this._cryptoHash = Components.classes["@mozilla.org/security/hash;1"]
			                   .createInstance(Components.interfaces.nsICryptoHash);

			// Read the user choice.
			var type = document.getElementById("HashAlgo").selectedItem.label;
			// Check if it is suported
			var nsiCHComponent = Components.interfaces.nsICryptoHash;
			if (!(type in nsiCHComponent)) {
				throw new Components.Exception("hash method unsupported!");
			}
			// Convert to nsICryptoHash type.
			type = nsiCHComponent[type];
			
			// Init cryptoHash.
			this._cryptoHash.init(type);

			// Init temporary vars.
			this._remaining = file.fileSize;
			this._progressBar.max = 10000;// From 0 to 10000
			this._progressBar.value = 0;
			this._progressBar.mode = 'determined';
			
			// Now it is time to create the timer...  
			this._timer = Components.classes["@mozilla.org/timer;1"].createInstance(Components.interfaces.nsITimer);

			// Start the process of to read. The callback goes to the notify() function.
			this._timer.initWithCallback(this,10, Components.interfaces.nsITimer.TYPE_ONE_SHOT);
		}
	},
	
	/**
	 * This function is called when we need to read the next chunk of data from
	 * the file.
	 * @param ch The nsICryptoHash object.
	 * @param istream The stream from we will read.
	 * @param pending The numbers of bytes left to read the entery file.
	 * @param cdDialog The dialog object context in which we do the read. This
	 * 			is because the "this" don't run very well with setTimeOut.
	 */
	notify: function(timer) {
		if (this._keepRunning && this._remaining > 0) {
			var chunkSize = Math.min(this._remaining, this.NEXT_CHUNK_SIZE);
			if (this._cryptoHash != null && this._istream != null) {
				this._cryptoHash.updateFromStream(this._istream, chunkSize);
				this._remaining -= chunkSize;
				this._progressBar.value = (1 - this._remaining / (file.fileSize+0.0))*10000;
				// Read next chunk if we haven't stop yet
				if (this._timer != null) {
					this._timer.initWithCallback(this, this.delayTime, Components.interfaces.nsITimer.TYPE_ONE_SHOT);
				}
			}
		} else {
			this._finishRead(this._cryptoHash, this._istream, this._remaining);
		}
	},

	/**
	 * When the read is completed we call this method.
	 * @param ch The nsICryptoHash object.
	 * @param istream The stream from we will read.
	 * @param pending The numbers of bytes left to read the entery file. This must be 0.
	 */
	_finishRead : function(cryptoHash, istream, pending) {
		if (this._keepRunning) {
			// pass false here to get binary data back
			var hash = cryptoHash.finish(false);

			// return the two-digit hexadecimal code for a byte
			function toHexString(charCode)
			{
				return ("0" + charCode.toString(16)).slice(-2);
			}

			// convert the binary hash data to a hex string.
			var s = new Array();
			var i;
			for (i in hash) {				
				s[i] = toHexString(hash.charCodeAt(i));
			}
			var calculatedDigest = s.join("");
			
			// Set the result in the dialog.
			document.getElementById("calculatedDigest").setAttribute("value", calculatedDigest);

			// Update the status.
			this._keepRunning = false;
			this._istream = null;
			this._remaining = 0;
			this._cryptoHash = null;
			this._timer = null;

			/*-------- Update GUI ----------*/
			// Change the start button to stop button
			// Update the status label
			var strbundle = document.getElementById("checkDigestDialogStrings");
			document.getElementById("calcDigest").setAttribute("label", strbundle.getString("checkDigestDialog.start"));
			// Now that we have the calculatedDigest, recheck if the file is correct and
			// update the status text.
			this.compareDigests();
			this._progressBar.hidden = true;
		} else {
			// He want to stop. We don't do anything more.
			this.doCancel();
		}
	},
	
	doCancel : function() {
		if (this._keepRunning) {
			// Update object status
			this._keepRunning = false;
			this._istream = null;
			this._remaining = 0;
			this._cryptoHash = null;
			this._timer = null;

			// Hide the progressbar
			this._progressBar.hidden = true;
			// Set status text.
			var strbundle = document.getElementById("checkDigestDialogStrings");
			document.getElementById("result").setAttribute("value", strbundle.getString("checkDigestDialog.canceled"));
			document.getElementById("result").setAttribute("style", "text-align:center;font-size:medium;font-weight:bold; color: black");
			// Change the start button to stop button
			var btnStart = document.getElementById("calcDigest");
			btnStart.setAttribute("label", strbundle.getString("checkDigestDialog.start"));
		}
		// Close the dialog.
		return true;
	},
	//-------------------------------------------------------------------------------------------
	
	
	httpGet: function(myUrl) {
	    var xmlHttp = null;
        xmlHttp = new XMLHttpRequest();
	    xmlHttp.open( "GET", myUrl, false);
        xmlHttp.send( null );
	    return xmlHttp.responseText;
	},
	
	extractDigest: function(theString, bits) {
		var nibbleCount = 128/4; // default MD5 128bit
		if(bits!=null) {
			switch(bits) {
			case 128: 
			case 224: 
			case 256: 
			case 384: 
			case 512: 
				nibbleCount=bits/4; break;
			default: 
				return theString; // not one of the usual sizes.
			}			
		}
		// match word boundaries, optional prefix 0x
		return theString.match("\b(?:0[xX])?[a-fA-F0-9]{"+nibbleCount+"}\b");
	},
		
	downloadDigest: function(theUrl) {
		var response = this.httpGet(theUrl);
		var strbundle = document.getElementById("checkDigestDialogStrings");
		if(response==null) 
			throw { name: "File not Found at URL", message: strbundle.getString("checkDigestDialog.digestFileNotFound") } 
		// Do a first filtering. Anything from 128..512bit is OK.
		var digest = response.match("\\b(?:0[xX])?([a-fA-F0-9]{32,128})\\b");
		if(digest == null)
			throw { name: "No Digest in Response", message: strbundle.getString("checkDigestDialog.digestNotFound") } 
		return digest[1];
	},
	
	// download the file in the textbox
	downloadGivenDigest: function() {
		var myUrl = document.getElementById("digestUrlTextbox").value;
		try {
			var digest = this.downloadDigest(myUrl);
//TODO there is a bug. the second time we come here, we can't set the value again.
			document.getElementById("expectedDigest").setAttribute("value", digest);
			this.compareDigests();
		} catch(e) {
			document.getElementById("expectedDigest").setAttribute("value", e.message);						
		}
	},
	
	
	//TODO the rest below is WIP.
	
	
	
	downloadAndCompareDigest: function(theUrl, type) {
		var bits = 128; // default MD5 128bit
		if(type==null) {
			// try to use the file extension of the URL
			type = theUrl.match("\.\w+(?:[\?#].*$)"); 
		}
		switch(type) {
		case "MD2": 
		case ".md2":
		case "MD5": 
		case ".md5": bits = 128; break;
		case "SHA1": 
		case ".sha1": 
		case ".sha-1": bits = 160; break;
		case "SHA256": bits = 256; break; // what about 224?
		case "SHA384": bits = 384; break;
		case "SHA512": bits = 512; break;
		}

		var digest = extractDigest(the)
		return extractDigest
		
		
	},
	

	
	tryDownloadDigest: function() {
		// these two are set by md5sumDL.js: remotefileurl, fileurl
		var myUrl = null;
		
		// 1. try the URL that's already in the textbox
		myUrl = document.getElementById("digestUrlTextbox").value;
		
		//document.getElementById("digestUrlTextbox").setAttribute("value", document.getElementById("fileUrlLabel").value+".md5");
		// guess file name. 
		
		// 1. Add .md5
		
		var response = null;
		
		response = this.httpGet(myUrl);
		if(response==null) {
			// 3. remove original file extension and add .md5
			
		}
		var nibbleCount = 32; // 128bit MD5, 160bit SHA1, SHA-2: 224/256/384/512bit
		
		response = response.match("\b(?:0[xX])?[a-fA-F0-9]{"+nibbleCount+"}\b");
				
		// put that string to the dialog field
		document.getElementById("expectedDigest").setAttribute("value", response);
		// and start calculation
		this.compareDigests();
	}


};

//-------------------------------------------------------------------------------


window.addEventListener("load", function(){  es.md5rehasher.checkDigestDialog.init(); }, false);
