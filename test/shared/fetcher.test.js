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

describe.only('fetcher', function() {
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
    var modelFetchSummary = {
            model: 'SomeModel',
            id: 123
        },
        collectionFetchSummary = {
          collection: 'SomeCollection',
          ids: [ 123, 456 ],
          params: { some: 'params' }
        },
        modelResult = new BaseModel({ id: 123 }),
        collectionStoreResult = _.extend({ meta: { some: 'meta' } }, collectionFetchSummary),
        collectionResult = new BaseCollection([{ id: 123 }, { id: 456 }]);

    beforeEach(function() {
      fetcher.modelStore = {
        get: sinon.stub()
      };
      fetcher.collectionStore = {
        get: sinon.stub()
      };
    });

    it("should be able hydrate a model from the modelStore", function (done) {
      var fetchSummary = { listing: modelFetchSummary };

      fetcher.modelStore.get.returns(modelResult);
      fetcher.hydrate(fetchSummary, function (err, hydrated) {
        should.not.exist(err);
        hydrated.should.deep.equal({ listing: modelResult });
        fetcher.modelStore.get.should.have.been.calledOnce;
        fetcher.modelStore.get.should.have.been.calledWith('SomeModel', 123, true);
        done();
      });
    });

    it('should set the app property on the model if it is passed in the options', function (done) {
      var fetchSummary = { listing: modelFetchSummary },
          appInstance = {};

      fetcher.modelStore.get.returns(modelResult);
      fetcher.hydrate(fetchSummary, { app: appInstance }, function (err, hydrated) {
        hydrated.listing.app.should.equal(appInstance);
        done();
      });
    });

    it('should be able to hydrate a collection from the collectionStore', function (done) {
      var fetchSummary = { listings: collectionFetchSummary };

      fetcher.collectionStore.get.yieldsAsync(collectionStoreResult);
      fetcher.retrieveModelsForCollectionName = sinon.stub().returns(collectionResult.models);
      fetcher.modelUtils.getCollection = sinon.stub().yields(collectionResult);

      fetcher.hydrate(fetchSummary, function (err, hydrated) {
        fetcher.collectionStore.get.should.have.been.calledOnce;
        fetcher.collectionStore.get.should.have.been.calledWith('SomeCollection', { some: 'params' });
        fetcher.retrieveModelsForCollectionName.should.have.been.calledOnce;
        fetcher.retrieveModelsForCollectionName.should.have.been.calledWith('SomeCollection', [ 123, 456 ]);
        fetcher.modelUtils.getCollection.should.have.been.calledOnce;
        fetcher.modelUtils.getCollection.should.have.been.calledWith('SomeCollection', collectionResult.models);
        hydrated.should.deep.equal({ listings: collectionResult });
        done();
      });
    });

    it('should set the app property on the collection if it is passed in the options', function (done) {
      var fetchSummary = { listings: collectionFetchSummary },
          appInstance = {};

      fetcher.collectionStore.get.yieldsAsync(collectionStoreResult);
      fetcher.retrieveModelsForCollectionName = sinon.stub().returns(collectionResult.models);
      fetcher.modelUtils.getCollection = sinon.stub().yields(collectionResult);

      fetcher.hydrate(fetchSummary, { app: appInstance }, function (err, hydrated) {
        hydrated.listings.app.should.equal(appInstance);
        done();
      });
    });

    it('should throw an error if a collection cannot be found in the collection store', function () {
      var fetchSummary = { listings: collectionFetchSummary };

      fetcher.collectionStore.get.yields(undefined);

      (function () {
        fetcher.hydrate(fetchSummary, function () {});
      }).should.throw('Collection of type "SomeCollection" not found for params: ' + JSON.stringify(collectionFetchSummary.params));
    });

    it('should be able to hydrate a mixed spec', function (done) {
      var fetchSummary = { listing: modelFetchSummary, listings: collectionFetchSummary };

      fetcher.modelStore.get.returns(modelResult);
      fetcher.collectionStore.get.yieldsAsync(collectionStoreResult);
      fetcher.retrieveModelsForCollectionName = sinon.stub().returns(collectionResult.models);
      fetcher.modelUtils.getCollection = sinon.stub().yieldsAsync(collectionResult);

      fetcher.hydrate(fetchSummary, function (err, hydrated) {
        hydrated.should.deep.equal({ listings: collectionResult, listing: modelResult });
        done();
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
