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
if(!es.md5rehasher.setDigestDialog) es.md5rehasher.setDigestDialog={};
es.md5rehasher.setDigestDialog = {

	downloadId : undefined,
	downloadPath : undefined,

	init: function(){
		// Initialization code
		this.initialized = true;
		
		this.downloadId = downloadId;
		this.downloadPath = file.path;

		// Set the path label text.
		document.getElementById("path").setAttribute("value", file.path);

		// Open the data base, setting the file directory in the user profile.
		this.initDbFile();
		
		this.loadDigest();
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

	validateSum: function() {
	  var strbundle = document.getElementById("setDigestDialogStr");
	  var expectedDigest = document.getElementById("expectedDigest").value;
	  var typeValue = document.getElementById("HashAlgo").label;
	  
	  expectedDigest = expectedDigest.replace(/\s/g, ''); // remove all whitespace characters
	  if(expectedDigest == "") { // user has not entered anything in the textfield yet
		  // so no need to check anything for now.
		  document.getElementById("result").setAttribute("value", strbundle.getString("setDigestDialog.unspecified"));
		  document.getElementById("result").setAttribute("style", "text-align:center; font-size:large;font-weight:bold; color: blue");
		  return;
	  }
	  expectedDigest = expectedDigest.toUpperCase(); // convert both values to upper case
	  
	  var correcto = 0;
	  
	  // Check length
	  if((typeValue == "MD5" || typeValue == "MD2") && expectedDigest.length != 32){
		  correcto = -1;
	  }else if(typeValue == "SHA1" && expectedDigest.length != 40){
		  correcto = -1;
	  }else if(typeValue == "SHA256" && expectedDigest.length != 64){
		  correcto = -1;
	  }else if(typeValue == "SHA384" && expectedDigest.length != 96){
		  correcto = -1;
	  }else if(typeValue == "SHA512" && expectedDigest.length != 128){
		  correcto = -1;
	  }
  
	  if(correcto != -1){// If still correct.
		  // Check if they are valid hex chars.
		  const hexChars = "0123456789ABCDEF";
		  var i = 0;
		  const sumLength = expectedDigest.length;
  
		  while(correcto!=-1 && i < sumLength){
			  correcto = hexChars.indexOf(expectedDigest.charAt(i));
			  i++;
		  }
	  }
  
	  if (correcto!=-1) {
		  document.getElementById("result").setAttribute("value", strbundle.getString("setDigestDialog.OK"));
		  document.getElementById("result").setAttribute("style", "text-align:center; font-size:large;font-weight:bold; color: green");
		  return true;
	  } else {
		  document.getElementById("result").setAttribute("value", strbundle.getString("setDigestDialog.Failed"));
		  document.getElementById("result").setAttribute("style", "text-align:center; font-size:large;font-weight:bold; color: red");
		  return false;
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
				this.validateSum();
			}
		} finally {
			statement.reset();
			statement.finalize();
			dbConn.close();
		}
	},

	// setDigest dialog acepted, do things.
	setDigestOk: function() {
		var strbundle = document.getElementById("setDigestDialogStr");

		// If changed to private browsing when the dialog is open.
		try {
			var pbs = Components.classes["@mozilla.org/privatebrowsing;1"]  
						.getService(Components.interfaces.nsIPrivateBrowsingService);
			if(pbs.privateBrowsingEnabled){
				// Warn the user about this can't be performed in private browsing.
				var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                        .getService(Components.interfaces.nsIPromptService);
				prompts.alert(window, strbundle.getString("setDigestDialog.privateBrowserAlertTitle"), strbundle.getString("setDigestDialog.privateBrowserAlertMsg"));
				// Close the dialog.
				return true;
			}
		} catch(ex) {  
			// ignore exceptions in older versions of Firefox  
		}
	
		// Check for valid digest
		if(!this.validateSum()){
			var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
						   .getService(Components.interfaces.nsIPromptService);
			prompts.alert(window, strbundle.getString("setDigestDialog.invalidDigestTitle"),strbundle.getString("setDigestDialog.invalidDigestMsg"));
			return false;
		}
				
		// Get values
		var digest = document.getElementById("expectedDigest").value;
		var digestType = document.getElementById("HashAlgo").label;
		
		// Write to BD
		var dbConn = this.storageService.openDatabase(this.dbFile);
		var statement = dbConn.createStatement("INSERT OR REPLACE INTO digests VALUES (?1, ?2, ?3, ?4)");

		try{
			statement.bindStringParameter(0, this.downloadId);
			statement.bindStringParameter(1, file.path);
			statement.bindStringParameter(2, digestType);
			statement.bindStringParameter(3, digest);
			statement.execute();
		} finally {
			statement.reset();
			statement.finalize();
			dbConn.close();
		}

		// Close dialog
		return true;
	}
}

window.addEventListener("load", function(){  es.md5rehasher.setDigestDialog.init(); }, false);  
