var _ = require('underscore'),
    chai = require('chai'),
    should = chai.should(),
    sinon = require('sinon'),
    sinonChai = require('sinon-chai'),
    ModelUtils = require('../../shared/modelUtils'),
    modelUtils = new ModelUtils(),
    AddClassMapping = require('../helpers/add_class_mapping'),
    addClassMapping = new AddClassMapping(modelUtils),
    BaseModel = require('../../shared/base/model'),
    BaseCollection = require('../../shared/base/collection'),
    App = require('../../shared/app'),
    fetcher = null;

chai.use(sinonChai);

var listingResponses = {
  basic: {
    name: 'Fetching!'
  },
  full: {
    name: 'Fetching!',
    city: 'San Francisco'
  }
};

var Listing = BaseModel.extend({
  jsonKey: 'listing',

  fetch: function(options) {
    var resp,
      _this = this;

    resp = getModelResponse('full', options.data.id, true);
    setTimeout(function() {
      var parsed = _this.parse(resp);
      _this.set(parsed);
      options.success(_this, parsed);
    }, 1);
  }
});
Listing.id = 'Listing';

var Listings = BaseCollection.extend({
  model: Listing,
  jsonKey: 'listings',

  fetch: function(options) {
    var resp,
      _this = this;

    resp = buildCollectionResponse(true);
    if (options.data != null) {
      resp.meta = options.data;
    }
    setTimeout(function() {
      var parsed = _this.parse(resp);
      _this.reset(parsed.map(function(attrs) {
        return new _this.model(attrs, {
          parse: true
        });
      }));
      options.success(_this, parsed);
    }, 1);
  }
});
Listings.id = 'Listings';

addClassMapping.add('Listing', Listing);
addClassMapping.add('Listings', Listings);

function getModelResponse(version, id, addJsonKey) {
  var resp;

  if (addJsonKey == null) {
    addJsonKey = false;
  }
  resp = _.extend({}, listingResponses[version], {
    id: id
  });
  if (addJsonKey) {
    return _.tap({}, function(obj) {
      obj.listing = resp;
    });
  } else {
    return resp;
  }
}

function buildCollectionResponse(addJsonKey) {
  var resp;

  if (addJsonKey == null) {
    addJsonKey = false;
  }
  resp = [1, 2, 3, 4, 5].map(function(id) {
    return getModelResponse('basic', id, addJsonKey);
  });
  if (addJsonKey) {
    return _.tap({}, function(obj) {
      obj.listings = resp;
    });
  } else {
    return resp;
  }
}

describe('fetcher', function() {
  beforeEach(function() {
    this.app = new App(null, {modelUtils: modelUtils});
    fetcher = this.app.fetcher;
  });

  describe('buildOptions', function () {
     it('should merge the app with custom options', function () {
       fetcher.buildOptions().should.be.deep.equal({app: this.app});
     });

    it('should append specified additional options', function () {
      fetcher.buildOptions({foo: 'bar'}).should.be.deep.equal({foo: 'bar', app: this.app});
    });

    it('should merge specified params with specified options that are empty', function () {
      fetcher.buildOptions(null, {foo: 'bar'}).should.be.deep.equal({foo: 'bar', app: this.app});
    });

    it('should merge specified params with the specified options', function () {
      var additionalOptions = {anyOption: 'withValue'},
        params = {anyParam: 'paramValue'},
        expected = {
          app: this.app,
          anyOption: 'withValue',
          anyParam: 'paramValue'
        };

      fetcher.buildOptions(additionalOptions, params).should.be.deep.equal(expected);
    });
  });

  describe('getModelOrCollectionForSpec', function () {
    beforeEach(function () {
      sinon.stub(modelUtils, 'getModelConstructor').returns(BaseModel);
      sinon.stub(modelUtils, 'getCollectionConstructor').returns(BaseCollection);
    });

    afterEach(function () {
      modelUtils.getModelConstructor.restore();
      modelUtils.getCollectionConstructor.restore();
    });

    it('should return an empty model', function () {
      var model = fetcher.getModelOrCollectionForSpec({ model: 'SomeModel' });

      modelUtils.getModelConstructor.should.have.been.calledOnce;
      modelUtils.getModelConstructor.should.have.been.calledWith('SomeModel');

      model.should.be.instanceOf(BaseModel);
      model.attributes.should.be.empty;
    });

    it('should return an empty collection', function () {
      var collection = fetcher.getModelOrCollectionForSpec({ collection: 'SomeCollection' });

      modelUtils.getCollectionConstructor.should.have.been.calledOnce;
      modelUtils.getCollectionConstructor.should.have.been.calledWith('SomeCollection');

      collection.should.be.instanceOf(BaseCollection);
      collection.should.have.length(0);
    });
  });

  describe('hydrate', function() {
    beforeEach(function() {
      fetcher.modelStore.clear();
      fetcher.collectionStore.clear();
    });

    it("should be able store and hydrate a model", function() {
      var fetchSummary, hydrated, listing, rawListing, results;

      rawListing = {
        id: 9,
        name: 'Sunny'
      };
      results = {
        listing: new Listing(rawListing, {
          app: this.app
        })
      };
      fetchSummary = {
        listing: {
          model: 'listing',
          id: 9
        }
      };
      fetcher.storeResults(results);
      fetcher.hydrate(fetchSummary, function(err, hydrated) {
        listing = hydrated.listing;
        listing.should.be.an.instanceOf(Listing);
        listing.toJSON().should.eql(rawListing);
      });
    });

    it("should be able to store and hydrate a collection", function() {
      var fetchSummary, hydrated, listings, params, rawListings, results;

      rawListings = [
        {
          id: 1,
          name: 'Sunny'
        }, {
          id: 3,
          name: 'Cloudy'
        }, {
          id: 99,
          name: 'Tall'
        }
      ];
      params = {
        items_per_page: 99
      };
      results = {
        listings: new Listings(rawListings, {
          params: params,
          app: this.app
        })
      };
      fetchSummary = {
        listings: {
          collection: 'listings',
          ids: _.pluck(rawListings, 'id'),
          params: params
        }
      };
      fetcher.storeResults(results);
      fetcher.hydrate(fetchSummary, function(err, hydrated) {
        listings = hydrated.listings;
        listings.should.be.an.instanceOf(Listings);
        listings.toJSON().should.eql(rawListings);
        listings.params.should.eql(params);
        should.not.exist(fetcher.collectionStore.get('Listings', {}));
        fetcher.collectionStore.get('Listings', params).should.eql({
          ids: listings.pluck('id'),
          meta: {},
          params: params
        });
      });
    });

    it("should be able to hydrate multiple objects at once", function() {
      var fetchSummary, hydrated, listing, listings, rawListing, rawListings, results;

      rawListing = {
        id: 9,
        name: 'Sunny'
      };
      rawListings = [
        {
          id: 1,
          name: 'Sunny'
        }, {
          id: 3,
          name: 'Cloudy'
        }, {
          id: 99,
          name: 'Tall'
        }
      ];
      results = {
        listing: new Listing(rawListing, {
          app: this.app
        }),
        listings: new Listings(rawListings, {
          app: this.app
        })
      };
      fetchSummary = {
        listing: {
          model: 'listing',
          id: 9
        },
        listings: {
          collection: 'listings',
          ids: [1, 3, 99]
        }
      };
      fetcher.storeResults(results);
      fetcher.hydrate(fetchSummary, function(err, hydrated) {
        listing = hydrated.listing;
        listing.should.be.an.instanceOf(Listing);
        listing.toJSON().should.deep.equal(rawListing);
        listings = hydrated.listings;
        listings.should.be.an.instanceOf(Listings);
        listings.toJSON().should.deep.equal(rawListings);
      });
    });

    it("should inject the app instance", function() {
      var app, listing1, model, results, summaries;

      listing1 = new Listing({
        id: 1
      });
      fetcher.modelStore.set(listing1);
      summaries = {
        model: {
          id: 1,
          model: 'Listing'
        }
      };
      app = {
        fake: 'app'
      };
      fetcher.hydrate(summaries, {app: app}, function(err, results) {
        model = results.model;
        model.app.should.eql(app);
      });
    });
  });

  describe('fetch', function() {
    var retrievedModel = new BaseModel(),
        result = { model: retrievedModel },
        fetchSpec = {
          model: {
            model: 'Listing',
            params: {
              id: 1
            }
          }
        };

    beforeEach(function() {
      fetcher._retrieve = sinon.stub();
    });

    it('should callback after calling _retrieve to fetch a model', function(done) {
      fetcher._retrieve.yieldsAsync(null, result);
      fetcher.fetch(fetchSpec, function (err, results) {
        should.not.exist(err);
        results.should.deep.equal(result);
        fetcher._retrieve.should.have.been.calledOnce;
        fetcher._retrieve.should.have.been.calledWith(fetchSpec);
        done(err);
      });
    });

    describe('options', function () {
      it('should correctly set the default options on the serverside', function () {
        fetcher.fetch(fetchSpec, function () {});
        fetcher._retrieve.should.have.been.calledOnce;
        fetcher._retrieve.should.have.been.calledWith(fetchSpec, { readFromCache: false, writeToCache: false });
      });

      it('should override the default option for readFromCache when it is passed', function () {
        fetcher.fetch(fetchSpec, { readFromCache: true }, function () {});
        fetcher._retrieve.should.have.been.calledOnce;
        fetcher._retrieve.should.have.been.calledWith(fetchSpec, { readFromCache: true, writeToCache: false });
      });

      it('should override the default option for writeToCache when it is passed', function () {
        fetcher.fetch(fetchSpec, { writeToCache: true }, function () {});
        fetcher._retrieve.should.have.been.calledOnce;
        fetcher._retrieve.should.have.been.calledWith(fetchSpec, { readFromCache: false, writeToCache: true });
      });
    });

    it('should count the number of pending fetches', function(done) {
      fetcher._retrieve.yieldsAsync();

      fetcher.pendingFetches.should.equal(0);
      fetcher.fetch(fetchSpec, function (err) {
        fetcher.pendingFetches.should.equal(0);
        done(err);
      });
      fetcher.pendingFetches.should.equal(1);
    });

    it('should trigger the fetch:start and fetch:end event', function(done) {
      var err = new Error('Test Error'),
          startStub = sinon.stub(),
          endStub = sinon.stub();

      fetcher._retrieve.yieldsAsync(err, result);
      fetcher.on('fetch:start', startStub);
      fetcher.on('fetch:end', endStub);

      fetcher.fetch(fetchSpec, function () {
        endStub.should.have.been.calledOnce;
        endStub.should.have.been.calledWith(fetchSpec, err, result);
        done();
      });
      startStub.should.have.been.calledOnce;
      startStub.should.have.been.calledWith(fetchSpec);
    });

    it('should store the fetch result if writeToCache is set to true', function (done) {
      fetcher.storeResults = sinon.stub();
      fetcher._retrieve.yieldsAsync(null, result);
      fetcher.fetch(fetchSpec, { writeToCache: true }, function () {
        fetcher.storeResults.should.have.been.calledOnce;
        fetcher.storeResults.should.have.been.calledWith(result);
        done();
      });
    });

  });

  describe('needsFetch', function () {
    var spec;

    beforeEach(function () {
      spec = { model: 'ModelName', params: { id: 123 } };
    });

    it('should return true if no modelData is passed', function () {
      fetcher.needsFetch(null, spec).should.be.true;
    });

    it('should return true if the ensured keys are not included in modelData', function () {
      spec.ensureKeys = [ 'key1' ];
      fetcher.needsFetch({ key2: 'value2' }, spec).should.be.true;
    });

    it('should return true if spec enforces a fetch via a boolean value', function () {
      spec.needsFetch = true;
      fetcher.needsFetch({ id: 123 }, spec).should.be.true;
    });

    it('should return true if spec enforces a fetch via a function', function () {
      var modelData = { id: 123 };
      spec.needsFetch = sinon.stub().returns(true);
      fetcher.needsFetch(modelData, spec).should.be.true;
      spec.needsFetch.should.have.been.calledOnce;
      spec.needsFetch.should.have.been.calledWith(modelData);
    });

    it('should return false otherwise', function () {
      fetcher.needsFetch({ id: 123 }, spec).should.be.false;
    });
  });

  describe('isMissingKeys', function() {
    before(function() {
      this.modelData = {
        id: 1,
        name: 'foobar'
      };
    });

    it("should be false if keys not passed in", function() {
      fetcher.isMissingKeys(this.modelData).should.be.false;
      fetcher.isMissingKeys(this.modelData, []).should.be.false;
    });

    it("should be false if keys passed in but are present", function() {
      fetcher.isMissingKeys(this.modelData, 'name').should.be.false;
      fetcher.isMissingKeys(this.modelData, ['name']).should.be.false;
      fetcher.isMissingKeys(this.modelData, ['id', 'name']).should.be.false;
    });

    it("should be true if any of the keys passed in is not present", function() {
      fetcher.isMissingKeys(this.modelData, 'city').should.be.true;
      fetcher.isMissingKeys(this.modelData, ['city']).should.be.true;
      fetcher.isMissingKeys(this.modelData, ['id', 'city']).should.be.true;
    });
  });

  describe('summarize', function() {
    it("should summarize a model", function() {
      var attrs, model, summary;

      attrs = {
        id: 1234,
        blahblah: 'boomtown'
      };
      model = new Listing(attrs);
      summary = fetcher.summarize(model);
      summary.model.should.eql('listing');
      summary.id.should.eql(attrs.id);
    });

    it("should support custom idAttribute", function() {
      var attrs, model, summary, CustomListing;

      attrs = {
        login: 'joeschmo',
        blahblah: 'boomtown'
      };

      CustomListing = BaseModel.extend({
        idAttribute: 'login'
      });
      CustomListing.id = 'CustomListing';

      model = new CustomListing(attrs);
      summary = fetcher.summarize(model);
      summary.model.should.eql('custom_listing');
      summary.id.should.eql(attrs.login);
    });

    it("should summarize a collection", function() {
      var collection, meta, models, params, summary;

      models = [
        {
          id: 1,
          name: 'foo'
        }, {
          id: 2,
          name: 'bar'
        }
      ];
      params = {
        some: 'key',
        other: 'value'
      };
      meta = {
        the: 'one',
        foo: 'butt'
      };
      collection = new Listings(models, {
        params: params,
        meta: meta
      });
      summary = fetcher.summarize(collection);
      summary.collection.should.eql('listings');
      summary.ids.should.eql([1, 2]);
      summary.params.should.eql(params);
      summary.meta.should.eql(meta);
    });
  });

  describe('checkFresh', function() {
    beforeEach(function() {
      fetcher.checkedFreshTimestamps = {};
      this.spec = {
        model: 'foobutt',
        params: {}
      };
    });

    describe('didCheckFresh', function() {
      it("should store it properly", function() {
        var key;

        fetcher.didCheckFresh(this.spec);
        key = fetcher.checkedFreshKey(this.spec);
        fetcher.checkedFreshTimestamps[key].should.be.ok;
      });
    });

    describe('shouldCheckFresh', function() {
      it("should return true if timestamp doesn't exist", function() {
        fetcher.shouldCheckFresh(this.spec).should.be.true;
      });

      it("should return true if timestamp exists and is greater than 'checkedFreshRate' ago", function() {
        var key, now;

        key = fetcher.checkedFreshKey(this.spec);
        now = new Date().getTime();
        fetcher.checkedFreshTimestamps[key] = now - fetcher.checkedFreshRate - 1000;
        fetcher.shouldCheckFresh(this.spec).should.be.true;
      });

      it("should return false if timestamp exists and is less than 'checkedFreshRate' ago", function() {
        var key, now;

        key = fetcher.checkedFreshKey(this.spec);
        now = new Date().getTime();
        fetcher.checkedFreshTimestamps[key] = now - 1;
        fetcher.shouldCheckFresh(this.spec).should.be.false;
      });
    });

    describe('checkedFreshKey', function () {
      it('should use the model name and params as identifier', function () {
        var spec = { model: 'SomeModel', params: { id: '123' } };
        fetcher.checkedFreshKey(spec).should.equal('{"name":"SomeModel","params":{"id":"123"}}');
      });
      it('should use the model name and params as identifier', function () {
        var spec = { collection: 'SomeCollection', params: { id: '123' } };
        fetcher.checkedFreshKey(spec).should.equal('{"name":"SomeCollection","params":{"id":"123"}}');
      });
    });
  });
});
