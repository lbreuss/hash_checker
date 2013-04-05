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
if(!es.md5rehasher.md5sumDL) es.md5rehasher.md5sumDL={};
es.md5rehasher.md5sumDL = {
	init: function(){
		// Initialization
		this.initialized = true;
		
		var dl_context_menu = document.getElementById("downloadContextMenu");
		dl_context_menu.addEventListener("popupshowing", es.md5rehasher.md5sumDL.md5sumAddMenuItem, false);

		// Open the data base, setting the file directory in the user profile.
		this.initDbFile();
		
		this.register();
		
		this.cleanHashs();
	},

	unload: function(){
		this.unregister();
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

	register: function() {
		var observerService = Components.classes["@mozilla.org/observer-service;1"]
		  .getService(Components.interfaces.nsIObserverService);
		observerService.addObserver(this, "download-manager-remove-download", false);
	},

	unregister: function() {
		var observerService = Components.classes["@mozilla.org/observer-service;1"]
		  .getService(Components.interfaces.nsIObserverService);
		observerService.removeObserver(this, "download-manager-remove-download");
	},

	observe: function(subject, topic, data) {
		if(topic == "download-manager-remove-download"){
			if(subject == null){
				this.cleanHashs();
			} else {
				// Remove only the donwload that have been removed.
				// Open the db connection.
				var dbConn = this.storageService.openDatabase(this.dbFile);
				var statement = dbConn
				  .createStatement("DELETE FROM digests where dlid=?1");
				// Get the download id
				var id = subject.QueryInterface(Components.interfaces.nsISupportsPRUint32);
				statement.bindStringParameter(0, id.data);
				try{
					statement.execute();
				} finally {
					statement.reset();
					statement.finalize();
					dbConn.close();
				}
			}
		}
	},
	
	cleanHashs: function() {
		// If "all" download have been clear, check downloads that have been removed.
		var dlMgr = Components.classes["@mozilla.org/download-manager;1"]
		  .getService(Components.interfaces.nsIDownloadManager);
		var dbConn = this.storageService.openDatabase(this.dbFile);
		var statement = dbConn
		  .createStatement("SELECT * FROM digests");
		var dlidToDelete = [];
		try {
			try {
				while (statement.executeStep()) {
					// While we have digest...
					// Get the info
					var dlid = statement.getString(0);
					// Check if exist.
					try {
						var download = dlMgr.getDownload(dlid);
						if(download.targetFile.path != statement.getString(1)){
							// If is other file, remove it.
							dlidToDelete[dlidToDelete.length] = dlid;
						}
					} catch (e) {
						if(e.name == "NS_ERROR_NOT_AVAILABLE"){
							// Don't exist, save to remove.
							dlidToDelete[dlidToDelete.length] = dlid;
						}
					}
				}
			} finally {
				statement.reset();
			}
			// Now, delete what we know that have been removed.
			for(var i=0; i<dlidToDelete.length; i++){
				statement = dbConn.createStatement("DELETE FROM digests where dlid=?1");
				statement.bindStringParameter(0,dlidToDelete[i]);
				try{
					statement.execute();
				} finally {
					statement.reset();
				}
			}
		} finally {
			statement.finalize();
			dbConn.close();
		}
	},

	// Assumptions: 1. that download context menu has already been built
	//                 by first 'popupshowing' event handler when this routine
	//                 is called
	//              2. that context menu contains "menuseparator_properties"
	//                 element when download state is "1"
	md5sumAddMenuItem: function(e){
		if (e.target.id != "downloadContextMenu")
			return;

		if (gDownloadsView.selectedItem)
		{
			var dl_state = parseInt(gDownloadsView.selectedItem.getAttribute("state"));
			if (dl_state == 1) // state = "download-done"
			{
				var md5sum_mitem = document.getElementById("md5sum-mitem");
				e.target.appendChild(document.getElementById("menuseparator").cloneNode(true));
				e.target.appendChild(md5sum_mitem.cloneNode(true));
			} else {
				var md5sum_mitem = document.getElementById("md5sum-miset");
				try {  
					var pbs = Components.classes["@mozilla.org/privatebrowsing;1"]  
								.getService(Components.interfaces.nsIPrivateBrowsingService);
					if(pbs.privateBrowsingEnabled){
						md5sum_mitem.disabled = true;
					} else {
						md5sum_mitem.disabled = false;
					}
				} catch(ex) {  
					// ignore exceptions in older versions of Firefox  
				}
				e.target.appendChild(document.getElementById("menuseparator").cloneNode(true));
				e.target.appendChild(md5sum_mitem.cloneNode(true));
			}

			return true;
		}
		return false;
	},
	
	checkDigest: function(){ 
		var strbundle = document.getElementById("md5sumDLStrings");
		var file = getLocalFileFromNativePathOrUrl(gDownloadsView.selectedItem.getAttribute("file"));
		if ( file.exists() == false ) {
			var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
						   .getService(Components.interfaces.nsIPromptService);
			prompts.alert(window, strbundle.getString("md5sumDL.notFileTitle"),strbundle.getString("md5sumDL.notFileMsg"));
			return;
		}
		var cddw = window.open("chrome://md5sum/content/checkDigestDialog.xul", "_blank", "chrome,centerscreen,dependent=yes");

		cddw.focus();
	
		// Set the url of the file.
		cddw.fileurl = gDownloadsView.selectedItem.getAttribute("file");
		// Set the local file object of the download.
		cddw.file = file;
		// Set the download id that we are setting.
		cddw.downloadId = gDownloadsView.selectedItem.getAttribute("dlid");
		// Set the download url of the file.
		cddw.remotefileurl = gDownloadsView.selectedItem.getAttribute("uri");
	},

	dialogSetSum: function(){
		var strbundle = document.getElementById("md5sumDLStrings");
		var file = getLocalFileFromNativePathOrUrl(gDownloadsView.selectedItem.getAttribute("file"));
		/*
		if ( file.exists() == false ) {
			var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
						   .getService(Components.interfaces.nsIPromptService);
			prompts.alert(window, strbundle.getString("md5sumDL.notFileTitle"),strbundle.getString("md5sumDL.notFileMsg"));
			return;
		}
		*/
		var sdd = window.open("chrome://md5sum/content/setDigestDialog.xul", "_blank", "chrome,centerscreen,dependent=yes");

		sdd.focus();

		// Set the url of the file.
		sdd.fileurl = gDownloadsView.selectedItem.getAttribute("file");
		// Set the local file object of the download.
		sdd.file = file;
		// Set the download id that we are setting.
		sdd.downloadId = gDownloadsView.selectedItem.getAttribute("dlid");
	}
};

window.addEventListener("load", function(){ es.md5rehasher.md5sumDL.init(); }, false);
window.addEventListener("unload", function(){ es.md5rehasher.md5sumDL.unload(); }, false);
