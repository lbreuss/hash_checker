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
if(!es.md5rehasher.options) es.md5rehasher.options={};
es.md5rehasher.options = {
		
		init: function(){
			// Initialization
			this.initialized = true;

			// Open the data base, setting the file directory in the user profile.
			this.initDbFile();
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

		unload: function(){
		},

		cleanAllHashs: function() {
			var strbundle = document.getElementById("optionsStr");
			var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
            .getService(Components.interfaces.nsIPromptService);
			
			// Well, ask if really want this.
			var r = prompts.confirm(null, strbundle.getString("options.confirmTitle"), strbundle.getString("options.confirmMsg"));
			if (!r) {
				return;
			}
			
			// We like to remove all history, open data base
			var dbConn = this.storageService.openDatabase(this.dbFile);
			// First count how much they are.
			var before;
			var statement = dbConn.createStatement("SELECT count(*) FROM digests");
			try {
				statement.executeStep();
				before = statement.getInt32(0);
			}finally {
				statement.finalize();
			}
			// Remove all
			statement = dbConn.createStatement("DELETE FROM digests");
			try {
				statement.execute();
			} finally {
				statement.finalize();
			}
			
			// Get how many have been left
			var after;
			statement = dbConn.createStatement("SELECT count(*) FROM digests");
			try {
				statement.executeStep();
				after = statement.getInt32(0);
			}finally {
				statement.finalize();
				dbConn.close();
			}
			
			// Alert with result.
			var msg = strbundle.getString("options.resultMsg");
			msg = msg.replace("%d", (before-after));
			prompts.alert(null, strbundle.getString("options.resultTitle"), msg);
		}
};

window.addEventListener("load", function(){ es.md5rehasher.options.init(); }, false);
window.addEventListener("unload", function(){ es.md5rehasher.options.unload(); }, false);