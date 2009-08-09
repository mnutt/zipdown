/**
 * DownloadProgressListener "class" is used to help update download items shown
 * in the Download Manager UI such as displaying amount transferred, transfer
 * rate, and time left for each download.
 *
 * This class implements the nsIDownloadProgressListener interface.
 */

  function ZipdownListener(console) {
    this.console = console;
  }

ZipdownListener.prototype = {
  //////////////////////////////////////////////////////////////////////////////
  //// nsISupports

  // QueryInterface: XPCOMUtils.generateQI([Ci.nsIDownloadProgressListener]),

  //////////////////////////////////////////////////////////////////////////////
  //// nsIDownloadProgressListener

  onDownloadStateChange: function dlPL_onDownloadStateChange(aState, aDownload)
  {
    var downloadEntry = gDownloadsView.getElementsByAttribute("dlid", aDownload.id)[0];
    updateExistingItem(downloadEntry);
  },

  onProgressChange: function dlPL_onProgressChange(aWebProgress, aRequest,
                                                   aCurSelfProgress,
                                                   aMaxSelfProgress,
                                                   aCurTotalProgress,
                                                   aMaxTotalProgress, aDownload)
  {
  },

  onStateChange: function(aWebProgress, aRequest, aState, aStatus, aDownload)
  {
  },

  onSecurityChange: function(aWebProgress, aRequest, aState, aDownload)
  {
  }
};
