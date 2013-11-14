/*
Copyright (C) 2013 Tony Mobily

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/



var 
  dummy

, declare = require('simpledeclare')
, tingodb = require('tingodb')({})
;

var engine = require("tingodb")({})
var ObjectId = engine.ObjectID.createFromString;


//var ObjectId = tingodb.ObjectID;



var TingoMixin = declare( null, {

  projectionHash: {},

  constructor: function( table, fields ){

    var self = this;

    // Make up the projectionHash, which is used in pretty much every query 
    self.projectionHash = {};
    Object.keys( fields ).forEach( function( field ) {
       self.projectionHash[ field ] = true;
    });

    // Make sure that I have `_id: false` in the projection hash (used in all finds)
    // if `_id` is not explicitely defined in the schema.
    // in "inclusive projections" in mongoDb, _id is added automatically and it needs to be
    // explicitely excluded (it is, in fact, the ONLY field that can be excluded in an inclusive projection)
    // FIXME: Taken this out of the picture, as _id is important when inserting and you want to re-fetch the doc
    // The solution is to manually delete _id if it's not in self.fields

    // if( typeof( fields._id ) === 'undefined' ) this.projectionHash._id = false ;

    // Create self.collection, used by every single query
    self.collection = self.db.collection( self.table );

  },

  // The default id maker available as an object method
  makeId: function( object, cb ){
    MongoSchemaMixin.makeId( object, cb );
  },



  _makeMongoParameters: function( filters ){

    var selector = {}, finalSelector = {};

    if( typeof( filters.conditions ) !== 'undefined' && filters.conditions !== null ){
      selector[ '$and' ] =  [];
      selector[ '$or' ] =  [];

      Object.keys( filters.conditions ).forEach( function( condition ){

        // Sets the mongo condition
        var mongoOperand = '$and';
        if( condition === 'or' ) mongoOperand = '$or';      
 
        filters.conditions[ condition ].forEach( function( fieldObject ){

          var field = fieldObject.field;

          var item = { };
          item[ field ] = {};

          var v = fieldObject.value;

          switch( fieldObject.type ){
            case 'lt':
              item[ field ] = { $lt: v };
            break;

            case 'lte':
              item[ field ] = { $lte: v };
            break;

            case 'gt':
              item[ field ] = { $gt: v };
            break;

            case 'gte':
              item[ field ] = { $gte: v };
            break;

            case 'is':
            case 'eq':
              item[ field ] = v;
            break;

            case 'startsWith':
              item[ field ] = { $regex: new RegExp('^' + v + '.*' ) };
            case 'startWith':
            break;

            case 'contain':
            case 'contains':
              item[ field ] = { $regex: new RegExp('.*' + v + '.*' ) };
            break;

            case 'endsWith':
              item[ field ] = { $regex: new RegExp('.*' + v + '$' ) };
            case 'endWith':
            break;

            default:
              throw( new Error("Field type unknown: " + fieldObject.type ) );
            break;
          }
         
          // Finally, push down the item!
          selector[ mongoOperand ].push( item );
        });
 
      });

      // Clean up selector, as Mongo doesn't like empty arrays for selectors
      if( selector[ '$and' ].length == 0 ){
        finalSelector[ '$or' ] = selector[ '$or' ];
      } else {
        finalSelector[ '$and' ] = selector[ '$and' ];

        if( selector[ '$or' ].length !== 0 ){
          finalSelector[ '$and' ].push( { '$or': selector[ '$or' ] } );
        }
        //console.log( "FINAL SELECTOR" );        
        //console.log( require('util').inspect( finalSelector, { depth: 10 } ) );        

      }


    };    

    var sortHash = filters.sort || {}; 
    return { querySelector: finalSelector, sortHash: sortHash };
  }, 

  select: function( filters, options, cb ){

    var self = this;
    var saneRanges;

    // Usual drill
    if( typeof( cb ) === 'undefined' ){
      cb = options;
      options = {}
    } else if( typeof( options ) !== 'object' || options === null ){
      return cb( new Error("The options parameter must be a non-null object") );
    }

    

    // Make up parameters from the passed filters
    try {
      var mongoParameters = this._makeMongoParameters( filters );
    } catch( e ){
      return cb( e );
    }

    // Actually run the query 
    var cursor = self.collection.find( mongoParameters.querySelector, self.projectionHash );

    // Sanitise ranges
    saneRanges = self.sanitizeRanges( filters.ranges );


    /*console.log("WTF?");
    console.log( filters );
    console.log( mongoParameters.querySelector );
    console.log( saneRanges );
    */

    // Skipping/limiting according to ranges/limits
    if( saneRanges.from != 0 )  cursor.skip( saneRanges.from );
    if( saneRanges.limit != 0 ) cursor.limit( saneRanges.limit );

    // Sort the query
    cursor.sort( mongoParameters.sortHash , function( err ){
      if( err ){
        next( err );
      } else {

        if( options.useCursor ){

          cursor.count( { applySkipLimit: true }, function( err, total ){

            cb( null, {

              next: function( done ){

                cursor.nextObject( function( err, obj) {
                  if( err ){
                    done( err );
                  } else {

                    // If options.delete is on, then remove a field straight after fetching it
                    if( options.delete && obj !== null ){
                      self.collection.remove( { _id: obj._id }, function( err, howMany ){
                        if( err ){
                          done( err );
                        } else {
                          done( null, obj );
                        }
                      });
                    } else {
                       done( null, obj );
                    }
                  }
                });
              },

              rewind: function( done ){
                if( options.delete ){
                  done( new Error("Cannot rewind a cursor with `delete` option on") );
                } else {
                  cursor.rewind();
                  done( null );
                }
              },
              close: function( done ){
                cursor.close( done );
              }
            }, total );
          })

        } else {

          cursor.toArray( function( err, queryDocs ){
            if( err ){
             cb( err );
            } else {
              cursor.count( { applySkipLimit: true }, function( err, total ){
                if( err ){
                  cb( err );
                } else {

                  if( options.delete ){
                    
                    self.collection.remove( mongoParameters.querySelector, { multi: true }, function( err ){
                      if( err ){
                        cb( err );
                      } else {
                        cb( null, queryDocs, total );
                      }
                    });
                  } else {
                    cb( null, queryDocs, total );
                  }
                };
              });

            };
          })

        }
      }
    });
       
  },


  select: function( filters, options, cb ){

    var self = this;
    var saneRanges;

    // Usual drill
    if( typeof( cb ) === 'undefined' ){
      cb = options;
      options = {}
    } else if( typeof( options ) !== 'object' || options === null ){
      return cb( new Error("The options parameter must be a non-null object") );
    }

    

    // Make up parameters from the passed filters
    try {
      var mongoParameters = this._makeMongoParameters( filters );
    } catch( e ){
      return cb( e );
    }

    // Actually run the query 
    var cursor = self.collection.find( mongoParameters.querySelector, self.projectionHash );

    // Sanitise ranges
    saneRanges = self.sanitizeRanges( filters.ranges );

    // Skipping/limiting according to ranges/limits
    if( saneRanges.from != 0 )  cursor.skip( saneRanges.from );
    if( saneRanges.limit != 0 ) cursor.limit( saneRanges.limit );

    // Sort the query
    cursor.sort( mongoParameters.sortHash , function( err ){
      if( err ){
        next( err );
      } else {

        if( options.useCursor ){

          cursor.count( { applySkipLimit: true }, function( err, total ){

            cb( null, {

              next: function( done ){

                cursor.nextObject( function( err, obj) {
                  if( err ){
                    done( err );
                  } else {

                    // If options.delete is on, then remove a field straight after fetching it
                    if( options.delete && obj !== null ){
                      self.collection.remove( { _id: obj._id }, function( err, howMany ){
                        if( err ){
                          done( err );
                        } else {
                          // Artificially delete doc._id if necessary
                          if( obj !== null && ! self.fields._id ) delete obj._id;

                          done( null, obj );
                        }
                      });
                    } else {

                     // Artificially delete doc._id if necessary
                      if( obj !== null && ! self.fields._id ) delete obj._id;

                      done( null, obj );
                    }
                  }
                });
              },

              rewind: function( done ){
                if( options.delete ){
                  done( new Error("Cannot rewind a cursor with `delete` option on") );
                } else {
                  cursor.rewind();
                  done( null );
                }
              },
              close: function( done ){
                cursor.close( done );
              }
            }, total);

          });


        } else {

          cursor.toArray( function( err, queryDocs ){
            if( err ){
             cb( err );
            } else {

              // Artificially delete doc._id if necessary
              queryDocs.forEach( function( doc ){
                if( doc !== null && ! self.fields._id ) delete doc._id;
              })

              cursor.count( { applySkipLimit: true }, function( err, total ){
                if( err ){
                  cb( err );
                } else {

                  if( options.delete ){
                    
                    self.collection.remove( mongoParameters.querySelector, { multi: true }, function( err ){
                      if( err ){
                        cb( err );
                      } else {
                        cb( null, queryDocs, total );
                      }
                    });
                  } else {
                    cb( null, queryDocs, total );
                  }
                };
              });

            };
          })

        }
      }
    });
       
  },



  update: function( filters, record, options, cb ){

    var self = this;
    var unsetObject = {};

    // Usual drill
    if( typeof( cb ) === 'undefined' ){
      cb = options;
      options = {}
    } else if( typeof( options ) !== 'object' || options === null ){
      return cb( new Error("The options parameter must be a non-null object") );
    }

    // It's Mongo: you cannot update record._id
    if( typeof( record._id ) !== 'undefined' ){
      return cb( new Error("You cannot update _id in MongoDb databases") );
    }

    // if `options.deleteUnsetFields`, Unset any value that is not actually set but IS in the schema,
    // so that partial PUTs will "overwrite" whole objects rather than
    // just overwriting fields that are _actually_ present in `body`
    if( options.deleteUnsetFields ){
      Object.keys( self.fields ).forEach( function( i ){
         if( typeof( record[ i ] ) === 'undefined' ) unsetObject[ i ] = 1;
      });
    }

    // Make up parameters from the passed filters
    try {
      var mongoParameters = this._makeMongoParameters( filters );
    } catch( e ){
      return cb( e );
    }

    // If options.multi is off, then use findAndModify which will accept sort
    if( !options.multi ){
      self.collection.findAndModify( mongoParameters.querySelector, mongoParameters.sortHash, { $set: record, $unset: unsetObject }, function( err, doc ){
        if( err ){
          cb( err );
        } else {

          if( doc ){
            cb( null, 1 );
          } else {
            cb( null, 0 );
          }
        }
      });

    // If options.multi is on, then "sorting" doesn't make sense, it will just use mongo's "update"
    } else {

      // Run the query
      self.collection.update( mongoParameters.querySelector, { $set: record, $unset: unsetObject }, { multi: true }, cb );
    }

  },


  insert: function( record, options, cb ){

    var self = this;
    var recordToBeWritten = {};

    // Usual drill
    if( typeof( cb ) === 'undefined' ){
      cb = options;
      options = {}
    } else if( typeof( options ) !== 'object' || options === null ){
      return cb( new Error("The options parameter must be a non-null object") );
    }

    // Copy record over, only for existing fields
    for( var k in record ){
      if( self.fields[ k ] ) recordToBeWritten[ k ] = record[ k ];
    }

    // Every record in Mongo MUST have an _id field
    if( typeof( recordToBeWritten._id ) === 'undefined' ) recordToBeWritten._id  = ObjectId();

    // Actually run the insert
    self.collection.insert( recordToBeWritten, function( err ){
      if( err ) {
        cb( err );
      } else {

        if( ! options.returnRecord ){
          cb( null );
        } else {
          self.collection.findOne( { _id: recordToBeWritten._id }, self.projectionHash, function( err, doc ){
            if( err ){
              cb( err );
            } else { 

              // Artificially delete doc._id if necessary
              if( doc !== null && ! self.fields._id ) delete doc._id;

              cb( null, doc );
            }
          });
        }
      }
    });

  },

  'delete': function( filters, options, cb ){

    var self = this;

    // Usual drill
    if( typeof( cb ) === 'undefined' ){
      cb = options;
      options = {}
    } else if( typeof( options ) !== 'object' || options === null ){
      return cb( new Error("The options parameter must be a non-null object") );
    }

    // Run the query
    try { 
      var mongoParameters = this._makeMongoParameters( filters );
    } catch( e ){
      return cb( e );
    }

    // If options.multi is off, then use findAndModify which will accept sort
    if( !options.multi ){
      self.collection.findAndRemove( mongoParameters.querySelector, mongoParameters.sortHash, function( err, doc ) {
        if( err ) {
          cb( err );
        } else {

          if( doc ){
            cb( null, 1 );
          } else {
            cb( null, 0 );
          }
        }
    });

    // If options.multi is on, then "sorting" doesn't make sense, it will just use mongo's "remove"
    } else {
      self.collection.remove( mongoParameters.querySelector, { single: false }, cb );
    }

  },


});

// The default id maker
TingoMixin.makeId = function( object, cb ){
  cb( null, ObjectId() );
},

exports = module.exports = TingoMixin;




          
