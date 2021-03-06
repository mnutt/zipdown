const nsIZipReader = Components.interfaces.nsIZipReader;

var ZipDown = {
  init : function() {
    // Really weird hack to make window._firebug.log work
    for(var w in window) {
      try {
	window[w].toString();
      } catch(e) {}
    }

    this.launchFileCallback = this.setupLaunchFileCallback();
    this.revealFileCallback = this.setupRevealFileCallback();

    // Catch new downloads as they appear
    var zipdownListener = new ZipdownListener();
    gDownloadManager.addListener(zipdownListener);

    // Catch existing downloads as they are rendered
    gDownloadsView.addEventListener("DOMNodeInserted", this.updateExistingItem, false);

    gDownloadsView.addEventListener("click", this.events.deselectTreeRows, false);
    gDownloadsView.addEventListener("click", this.events.clickTwistyOrLabel, false);
    gDownloadsView.addEventListener("dblclick", this.events.ignoreToggle, true);
    gDownloadsView.addEventListener("dblclick", this.events.doubleClickTree, true);
  },

  events: {
    clickTwistyOrLabel: function(event) {
      if(event.originalTarget.className == "itemCount" || event.originalTarget.className == "twisty") {
	var listItem = event.originalTarget.parentNode.parentNode.parentNode.parentNode;
	ZipDown.toggleZipList(listItem);
      }
    },

    // If a regular download is selected, deselect any sub-items of any download
    deselectTreeRows: function(event) {
      if(event.explicitOriginalTarget.tagName == "richlistitem" || event.originalTarget.tagName == "treechildren") {
	var trees = gDownloadsView.getElementsByTagName('tree');

	if(trees.length > 0) {
	  for(var i in trees) {
	    var tree = trees[i];
	    if(typeof(tree.view) == "undefined" || tree.view == null) { continue; }
	    if(event.originalTarget.parentNode == tree) { continue; }
	    tree.view.selection.clearSelection();
	  }
	}
      }
    },

    // Don't try to call the default double click action if we're clicking on the twisty or
    // label.  This allows rapid expanding/collapsing.
    ignoreToggle: function(event) {
      if(event.originalTarget.className == "itemCount" || event.originalTarget.className == "twisty") {
	event.cancelBubble = true;
	return false;
      }
    },

    // Default action when double clicking an item in the tree is to try to launch it
    doubleClickTree: function(event) {
      if(event.originalTarget.tagName == "treechildren") {
	var tree = event.originalTarget.parentNode;
	if(typeof(tree) == "undefined") { return; }

	var tbo = tree.treeBoxObject;

	// get the row, col and child element at the point
	var row = { }, col = { }, child = { };
	tbo.getCellAt(event.clientX, event.clientY, row, col, child);

	ZipDown.openTreeFile(tree, row, col);

	event.cancelBubble = true;
	return false;
      }
    },

    context: {
      zipfileOpen: function(event) {
	var treeChild = ZipDown.getClickedTreeChildFromContextMenu();
	var zipItem = treeChild.parentNode.parentNode.parentNode;
	var path = treeChild.children[0].children[1].getAttribute("label");

	var progressLabel = treeChild.children[0].children[0];
	ZipDown.startThrobber(progressLabel);

	ZipDown.openFileFromZip(zipItem.getAttribute("file"), path, progressLabel);
      },

      zipfileShow: function(event) {
	var treeChild = ZipDown.getClickedTreeChildFromContextMenu();
	var zipItem = treeChild.parentNode.parentNode.parentNode;
	var path = treeChild.children[0].children[1].getAttribute("label");

	var progressLabel = treeChild.children[0].children[0];
	ZipDown.startThrobber(progressLabel);

	ZipDown.revealFileFromZip(zipItem.getAttribute("file"), path, progressLabel);
      }
    }
  },

  openTreeFile: function(tree, row, col){
    var filename = tree.view.getCellText(row.value, col.value);
    var zipname = tree.parentNode.getAttribute("file");

    var progressLabel = tree.getElementsByTagName('treerow')[row.value].children[0];
    ZipDown.startThrobber(progressLabel);

    ZipDown.openFileFromZip(zipname, filename, progressLabel);
  },

  startThrobber: function(progressLabel) {
    progressLabel.setAttribute('src', "chrome://zipdown/skin/throbber.png");
  },

  toggleZipList: function(listItem) {
    var expanded = (listItem.getAttribute('expanded') == "true");

    // In some instances the parent item loses focus
    listItem.parentNode.focus();

    if(expanded) {
      listItem.setAttribute('expanded', "false");
    } else {
      // The first time the archive is expanded, create the contents tree
      ZipDown.createZipTree(listItem);

      listItem.setAttribute('expanded', "true");
    }
  },

  createZipTree: function(item) {
    if(item.getElementsByTagName('tree').length > 0) { return false; }

    var files = ZipDown.readEntriesFromZip(item.getAttribute('file'));

    var tree = document.getElementById("zipCollectionTemplate").children[0].cloneNode(true);
    tree.setAttribute("rows", files.length);
    var treeChildren = tree.getElementsByTagName("treechildren")[0];

    for(var i in files) {
      var fileItem = ZipDown.createZipItem(files[i]);
      treeChildren.appendChild(fileItem);
    }

    item.appendChild(tree);
  },

  // Create a dom node for an item in a zip archive
  createZipItem: function(file) {
    var fileItem = document.getElementById('zipItemTemplate').
                   getElementsByTagName('treeitem')[0].cloneNode(true);
    var fileCell = fileItem.getElementsByTagName('treecell')[1];
    fileCell.setAttribute('label', file);
    return fileItem;
  },

  // Update the download item in the download manager with the number of archived files
  updateExistingItem: function(item) {
    if(item.target.getAttribute('file').split('.')[item.target.getAttribute('file').split('.').length-1] == "zip") {
      var files = ZipDown.readEntriesFromZip(item.target.getAttribute('file'));
      item.target.setAttribute("zip", "true");
      item.target.setAttribute("itemCount", files.length + " items");
    }
  },

  readEntriesFromZip: function(zipPath, filePattern, sZipReader) {
    if(typeof(sZipReader) == "undefined") {
      var mZipReader = Components.classes["@mozilla.org/libjar/zip-reader;1"].createInstance(nsIZipReader);
      var file = getLocalFileFromNativePathOrUrl(zipPath);
      mZipReader.open(file);
    } else {
      var mZipReader = sZipReader;
      var alreadyOpen = true;
    }

    var entries = mZipReader.findEntries(filePattern);

    var files = [];

    while (entries.hasMore()) {
      var filepath = entries.getNext();
      if(typeof(filePattern) == "undefined" && filepath.match(/\.app\/.+/)) { continue; }
      files.push(filepath);
    }

    if(!alreadyOpen) { mZipReader.close(); }
    return files.sort();
  },

  getFileFromZip: function(zipPath, filePath, sZipReader) {
    if(typeof(sZipReader) == "undefined") {
      var mZipReader = Components.classes["@mozilla.org/libjar/zip-reader;1"].createInstance(nsIZipReader);
      var zipFile = getLocalFileFromNativePathOrUrl(zipPath);
    } else {
      var mZipReader = sZipReader;
      var alreadyOpen = true;
    }

    var isDirectory = false;
    if(filePath.match(/\/$/)) {
      filePath = filePath.replace(/\/$/, '');
      isDirectory = true;
    }

    var f = Components.classes["@mozilla.org/file/directory_service;1"].
            getService(Components.interfaces.nsIProperties).
            get("TmpD", Components.interfaces.nsILocalFile);
    if(alreadyOpen) { // Is a subfile
      var pathArray = filePath.split('/');
      for(var i = 0; i < pathArray.length; i++) {
	f.append(pathArray[i]);
      }
    } else {
      f.append(filePath.split('/')[filePath.split('/').length-1]);
    }

    // Remove an existing tmp file if it already exists
    if(!alreadyOpen && f.exists(f.path)) {
      f.remove(true);
    }

    if(isDirectory) {
      f.createUnique(Components.interfaces.nsILocalFile.DIRECTORY_TYPE, 0777);
    } else {
      f.createUnique(Components.interfaces.nsILocalFile.NORMAL_FILE_TYPE, 0666);
    }

    if(!alreadyOpen) { mZipReader.open(zipFile); }

    if(isDirectory) {
      mZipReader.extract(filePath+"/", f);
      var subFiles = ZipDown.readEntriesFromZip(zipPath, filePath+"/*", mZipReader);
      subFiles.shift();
      var depth = filePath.split('/').length + 2;

      for(var i = 0; i < subFiles.length; i++) {
	if(subFiles[i][subFiles[i]] != '/' && subFiles[i].split('/').length != depth) { continue; }
	ZipDown.getFileFromZip(zipPath, subFiles[i], mZipReader);
      }
    } else {
      mZipReader.extract(filePath, f);
    }

    if(!alreadyOpen) { mZipReader.close(); }

    return f;
  },

  revealFileFromZip: function(zipPath, filePath, progressLabel) {
    var background = Components.classes["@mozilla.org/thread-manager;1"].getService().newThread(0);
    var workingThread = ZipDown.setupWorkingThreadCallback(background);
    background.dispatch(new workingThread(zipPath, filePath, progressLabel, true), background.DISPATCH_NORMAL);
  },

  openFileFromZip: function(zipPath, filePath, progressLabel) {
    var background = Components.classes["@mozilla.org/thread-manager;1"].getService().newThread(0);
    var workingThread = ZipDown.setupWorkingThreadCallback(background);
    background.dispatch(new workingThread(zipPath, filePath, progressLabel), background.DISPATCH_NORMAL);
  },

  getClickedTreeChildFromContextMenu: function() {
    var row = document.popupNode._lastSelectedRow;
    var treeChildren = document.popupNode;
    return treeChildren.children[row];
  },

  setupLaunchFileCallback: function() {
    var launchFileCallback = function(file, progressLabel) {
      this.file = file;
      this.progressLabel = progressLabel;
    };

    launchFileCallback.prototype = {
      run: function() {
	try {
	  var f = this.file;
	  this.progressLabel.setAttribute('src', '');

	  // Duplicated in downloads.js, unfortunately
	  if (f.isExecutable()) {
	    var dontAsk = false;
	    var pref = Cc["@mozilla.org/preferences-service;1"].
                       getService(Ci.nsIPrefBranch);
	    try {
	      dontAsk = !pref.getBoolPref(PREF_BDM_ALERTONEXEOPEN);
	    } catch (e) { }

	    if (!dontAsk) {
	      var strings = document.getElementById("downloadStrings");
	      var name = f.leafName;
	      var message = strings.getFormattedString("fileExecutableSecurityWarning", [name, name]);

	      let title = gStr.fileExecutableSecurityWarningTitle;
	      let dontAsk = gStr.fileExecutableSecurityWarningDontAsk;

	      var promptSvc = Cc["@mozilla.org/embedcomp/prompt-service;1"].
                              getService(Ci.nsIPromptService);
	      var checkbox = { value: false };
	      var open = promptSvc.confirmCheck(window, title, message, dontAsk, checkbox);

	      if (!open)
		return;
	      pref.setBoolPref(PREF_BDM_ALERTONEXEOPEN, !checkbox.value);
	    }
	  }
	  try {
	    f.launch();
	  } catch (ex) {
	    // if launch fails, try sending it through the system's external
	    // file: URL handler
	    openExternal(f);
	  }
	} catch(err) {
	  Components.utils.reportError(err);
	}
      },

      QueryInterface: function(iid) {
	if (iid.equals(Components.interfaces.nsIRunnable) ||
            iid.equals(Components.interfaces.nsISupports)) {
          return this;
	}
	throw Components.results.NS_ERROR_NO_INTERFACE;
      }
    };
    return launchFileCallback;
  },

  setupRevealFileCallback: function() {
    var revealFileCallback = function(file, progressLabel) {
      this.file = file;
      this.progressLabel = progressLabel;
    };

    revealFileCallback.prototype = {
      run: function() {
	this.progressLabel.setAttribute('src', '');
	this.file.reveal();
      },

      QueryInterface: function(iid) {
	if (iid.equals(Components.interfaces.nsIRunnable) ||
            iid.equals(Components.interfaces.nsISupports)) {
          return this;
	}
	throw Components.results.NS_ERROR_NO_INTERFACE;
      }
    };
    return revealFileCallback;
  },

  setupWorkingThreadCallback: function(background) {
    var workingThread = function(zipPath, filePath, progressLabel, reveal) {
      this.zipPath = zipPath;
      this.filePath = filePath;
      this.progressLabel = progressLabel;
      this.reveal = reveal;
    };

    workingThread.prototype = {
      run: function() {
	try {
	  // This is where the working thread does its processing work.
	  var f = ZipDown.getFileFromZip(this.zipPath, this.filePath);


	  // When it's done, call back to the main thread to let it know
	  // we're finished.
	  var main = Components.classes["@mozilla.org/thread-manager;1"].getService().mainThread;


	  if(this.reveal) {
	    main.dispatch(new ZipDown.revealFileCallback(f, this.progressLabel),
			  background.DISPATCH_NORMAL);
	  } else {
	    main.dispatch(new ZipDown.launchFileCallback(f, this.progressLabel),
			  background.DISPATCH_NORMAL);
	  }
	} catch(err) {
	  Components.utils.reportError(err);
	}
      },

      QueryInterface: function(iid) {
	if (iid.equals(Components.interfaces.nsIRunnable) ||
            iid.equals(Components.interfaces.nsISupports)) {
          return this;
	}
	throw Components.results.NS_ERROR_NO_INTERFACE;
      }
    };
    return workingThread;
  }
};

window.addEventListener("load", function(e) { ZipDown.init(); }, false);
