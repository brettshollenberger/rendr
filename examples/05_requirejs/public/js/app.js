require(
[ 'handlebars'
, 'app/routes'
, 'rendr/shared/globals'
, 'rendr-handlebars'
], function() {

  require(
  [ 'app/app'
  , 'app/router'
  , 'app/templates/compiledTemplates'
  ], function(App, AppRouter) {

    // global reference
    var app = window.app = new App(appNS.appData, {
      ClientRouter: AppRouter
    });
    app.bootstrapData(appNS.bootstrappedData);
    app.start();
  });
});
