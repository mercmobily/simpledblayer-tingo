/*
Copyright (C) 2013 Tony Mobily

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/



var 
  dummy

, declare = require('simpledeclare')
, engine = require("tingodb")({})
, async = require('async')
, debug = require('debug')
;

// Return the object itself, or a createFromString() version of it
var ObjectId = function( id ){
  if( id instanceof engine.ObjectID ) return id;
  return engine.ObjectID.createFromString( id );
}

var consolelog = debug( 'simpledblayer:tingo');

var TingoMixin = declare( null, {

  _projectionHash: {},
  _fieldsHash: {},

  constructor: function( table, options ){

    var self = this;

    // Make up the _***Hash variables, which are used widely
    // within the module
    self._projectionHash = {};
    self._fieldsHash = {};

    //consolelog('\n\nINITIATING ', self );

    Object.keys( self.schema.structure ).forEach( function( field ) {
      var entry = self.schema.structure[ field ];
      self._fieldsHash[ field ] = true;
      if( ! entry.skipProjection ) self._projectionHash[ field ] = true;
    });

    // Create self.collection, used by every single query
    self.collection = self.db.collection( self.table );

  },

  // The default id maker available as an object method
  makeId: function( object, cb ){
    TingoMixin.makeId( object, cb );
  },

  // Make parameters for queries. It's the equivalent of what would be
  // an SQL creator for a SQL layer
  _makeTingoParameters: function( filters, fieldPrefix ){

    var self = this;

    var selector = {}, finalSelector = {};

    if( typeof( filters.conditions ) !== 'undefined' && filters.conditions !== null ){
      selector[ '$and' ] =  [];
      selector[ '$or' ] =  [];

      Object.keys( filters.conditions ).forEach( function( condition ){

        // Sets the mongo condition
        var mongoOperand = '$and';
        if( condition === 'or' ) mongoOperand = '$or';      
 
        filters.conditions[ condition ].forEach( function( fieldObject ){

          if( fieldPrefix ) {
            fieldPrefix = fieldPrefix + '.';
          } else {
            fieldPrefix = '';
          }

          var field = fieldObject.field;
          var v = fieldObject.value;

          // If a search is attempted on a non-searchable field, will throw
          //consolelog("SEARCHABLE HASH: ", self._searchableHash, field );
          if( !self._searchableHash[ fieldPrefix + field ] ){
            //consolelog( self._searchableHash, { depth: 10 } );
            throw( new Error("Field " + fieldPrefix + field + " is not searchable" ) );
          }

         // Change 'field' so that it includes the full path, including the prefix.
         // If it's a string, change to uppercase search (uppercase v, and search on __uc__ field)
         // This way, all searches are case-insensitive
          if( self._searchableHash[ fieldPrefix + field ] === 'upperCase' ){
            v = v.toUpperCase();
            field = fieldPrefix + '__uc__' + field;
          } else {
            field = fieldPrefix + field;
          }

          // If there are ".", then some children records are being referenced.
          // The actual way they are placed in the record is in _children; so,
          // add _children where needed.
          field = self._makeTingoFieldPath( field );

          // Make up item. Note that any search will be based on _searchData
          var item = { };
          item[ field ] = {};

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
            case 'startWith':
              item[ field ] = new RegExp('^' + v + '.*' );
            break;

            case 'contain':
            case 'contains':
              item[ field ] = new RegExp('.*' + v + '.*' );
            break;

            case 'endsWith':
            case 'endWith':
              item[ field ] = new RegExp('.*' + v + '$' );
            break;

            default:
              throw( new Error("Field type unknown: " + fieldObject.type ) );
            break;
          }
        
          // Finally, push down the item!
          selector[ mongoOperand ].push( item );
        });
 
      });

      // Assign the `finalSelector` variable. Note that the final result can be:
      // * Just $and conditions: { '$and': [ this, that, other ] }
      // * Just $or conditions : { '$or': [ this, that, other ] }
      // * $and conditions with $or: { '$and': [ this, that, other, { '$or': [ blah, bleh, bligh ] } ] }

      // No `$and` conditions...
      if( selector[ '$and' ].length === 0 ){
        // ...maybe there are `or` ones, which will get returned
        if( selector[ '$or' ].length !== 0 ) finalSelector[ '$or' ] = selector[ '$or' ];

      // There are `$and` conditions: assign them...
      } else {
        finalSelector[ '$and' ] = selector[ '$and' ];

        // ...and shove the `$or` ones in there as one of them
        if( selector[ '$or' ].length !== 0 ){
          finalSelector[ '$and' ].push( { '$or': selector[ '$or' ] } );
        }

      }
      consolelog( "FINAL SELECTOR" );        
      consolelog( require('util').inspect( finalSelector, { depth: 10 } ) );        
      consolelog( this.table );
    };    

    // make sortHash
    // If field is marked as upperCase, swap field names for _uc_ equivalent so that
    // sorting happens regardless of upper or lower case
    var sortHash = {};

    consolelog( "filters.sort is:", filters.sort );        
    //consolelog( "_sortableHash is:", self._sortableHash );        
    for( var field  in filters.sort ) {
      var sortDirection = filters.sort[ field ]

      //if( self._sortableHash[ field ] || field === self.positionField ){
      if( self._searchableHash[ field ] || field === self.positionField ){

        field = self._makeTingoFieldPath( field );
        if( self._searchableHash[ field ] === 'upperCase' ){
          field = self._addUcPrefixToPath( field );
        }

        sortHash[ field ] = sortDirection;
      }
    }
    consolelog( "FINAL SORTHASH", self.table );        
    consolelog( require('util').inspect( sortHash, { depth: 10 } ) );        

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
      var mongoParameters = this._makeTingoParameters( filters );
    } catch( e ){
      return cb( e );
    }

    // If sortHash is empty, AND there is a self.positionField, then sort
    // by the element's position
    consolelog("TABLE:", self.table );
    consolelog("SORT HASH", mongoParameters.sortHash );
    consolelog( Object.keys( mongoParameters.sortHash ).length );
    consolelog( self.positionField );

    if( Object.keys( mongoParameters.sortHash ).length === 0 && self.positionField ){
      mongoParameters.sortHash[ self.positionField ] = 1;
    }

    //consolelog("CHECK THIS:");
    //consolelog( require('util').inspect( mongoParameters, { depth: 10 } ) );

    var projectionHash = {};
    if( ! options.children ){
      projectionHash = self._projectionHash;
    } else {
      for( var k in self._projectionHash ) projectionHash[ k ] = self._projectionHash[ k ];
      projectionHash._children = true;
    }


    consolelog("PH: ", mongoParameters.querySelector, projectionHash );
    consolelog("TABLE: ", self.table );

    // Actually run the query 
    var cursor = self.collection.find( mongoParameters.querySelector, projectionHash );
    //consolelog("FIND IN SELECT: ",  mongoParameters.querySelector, self._projectionHash );

    // Sanitise ranges. If it's a cursor query, or if the option skipHardLimitOnQueries is on,
    // then will pass true (that is, the skipHardLimitOnQueries parameter will be true )
    saneRanges = self.sanitizeRanges( filters.ranges, options.useCursor || options.skipHardLimitOnQueries );

    // Skipping/limiting according to ranges/limits
    if( saneRanges.from != 0 )  cursor.skip( saneRanges.from );
    if( saneRanges.limit != 0 ) cursor.limit( saneRanges.limit );

    // Sort the query
    cursor.sort( mongoParameters.sortHash , function( err ){
      if( err ){
        next( err );
      } else {

        if( options.useCursor ){

          cursor.count( function( err, grandTotal ){
            if( err ){
              cb( err );
            } else {

              cursor.count( { applySkipLimit: true }, function( err, total ){
                if( err ){
                  cb( err );
                } else {

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

                                if( typeof( self._fieldsHash._id ) === 'undefined' )  delete obj._id;

                                // We will need this later if option.children was true, as
                                // schema.validate() will wipe it
                                if( options.children ) var _children = obj._children;

                                self.schema.validate( obj, { deserialize: true }, function( err, obj, errors ){

                                  // If there is an error, end of story
                                  // If validation fails, call callback with self.SchemaError
                                  if( err ) return cb( err );
                                  //if( errors.length ) return cb( new self.SchemaError( { errors: errors } ) );

                                  // Re-add children, since it was required by the options
                                  // and got cleaned out by schema.validate()
                                  if( options.children ) obj._children = _children;
                                  self._deleteUcFieldsfromChildren( _children );

                                  done( null, obj );
                                });
                              }
                            });
                          } else {

                            if( obj !== null && typeof( self._fieldsHash._id ) === 'undefined' )  delete obj._id;

                            if( obj === null ) return done( null, obj );

                            self.schema.validate( obj, {  deserialize: true }, function( err, obj, errors ){

                              // If there is an error, end of story
                              // If validation fails, call callback with self.SchemaError (MAYBE?)
                              if( err ) return cb( err );
                              //if( errors.length ) return cb( new self.SchemaError( { errors: errors } ) );

                              // Re-add children, since it was required by the options
                              // and got cleaned out by schema.validate()
                              if( options.children ){
                                obj._children = _children;
                                self._deleteUcFieldsfromChildren( _children );
                              }
                              done( null, obj );
                            });
                              
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
                  }, total, grandTotal );

                }
              });

            }
          });

        } else {


          cursor.toArray( function( err, queryDocs ){
            if( err ){
             cb( err );
            } else {

              cursor.count( function( err, grandTotal ){
                if( err ){
                  cb( err );
                } else {

                  cursor.count( { applySkipLimit: true }, function( err, total ){
                    if( err ){
                      cb( err );
                    } else {

                      // Cycle to work out the toDelete array _and_ get rid of the _id_
                      // from the resultset
                      var toDelete = [];
                      queryDocs.forEach( function( doc ){
                        if( options.delete ) toDelete.push( doc._id );
                        if( typeof( self._fieldsHash._id ) === 'undefined' ) delete doc._id;
                      });

                      // If it was a delete, delete each record
                      // Note that there is no check whether the delete worked or not
                      if( options.delete ){
                        toDelete.forEach( function( _id ){
                          self.collection.remove( { _id: _id }, function( err ){ } );
                        });
                      }

                      var changeFunctions = [];
                      // Validate each doc, running a validate function for each one of them in parallel
                      queryDocs.forEach( function( doc, index ){

                        // We will need this later if option.children was true, as
                        // schema.validate() will wipe it
                        if( options.children ) var _children = doc._children;

                        changeFunctions.push( function( callback ){
                          self.schema.validate( doc,  { deserialize: true }, function( err, validatedDoc, errors ){
                            if( err ){
                              callback( err );
                            } else {

                              // Re-add children, since it was required by the options
                              // and got cleaned out by schema.validate()
                              if( options.children ){
                                validatedDoc._children = _children;
                                self._deleteUcFieldsfromChildren( _children );
                              }
                               
                              //if( errors.length ) return cb( new self.SchemaError( { errors: errors } ) );
                              queryDocs[ index ] = validatedDoc;
                               
                              callback( null );
                            }
                          });
                        });
                      }); 
                      async.parallel( changeFunctions, function( err ){
                        if( err ) return cb( err );

                        // That's all!
                        cb( null, queryDocs, total, grandTotal );
                      });

                    };
                  });

                };
              });

            };
          })

        }
      }
    });
       
  },


  update: function( filters, updateObject, options, cb ){

    var self = this;

    var unsetObject = {};

    var rnd = Math.floor(Math.random()*100 );
    consolelog( "\n");
    consolelog( rnd, "ENTRY: update for ", self.table, ' => ', updateObject, "options:", options );


    // Usual drill
    if( typeof( cb ) === 'undefined' ){
      cb = options;
      options = {}
    } else if( typeof( options ) !== 'object' || options === null ){
      return cb( new Error("The options parameter must be a non-null object") );
    }


    // You cannot do a multiple update when options.deleteUnsetFields is set, as _every_
    // required field needs to be specified -- and the idProperty is obviously required
    // deleteUnsetFields is there so that a "document.save()"-style called can be performed
    // easily.
    if( options.multi && options.deleteUnsetFields ){
      return cb( new Error("THe options multi and deleteUnsetFields are mutually exclusive -- one or the other") );
    }

    // Validate the record against the schema

    // If deleteUnsetFields is set, then the validation will apply to _every_ field in the schema.
    // Otherwise, just to the passed fields is fine
    var onlyObjectValues = options.deleteUnsetFields ? false : true;

    // Validate what was passed...
    self.schema.validate( updateObject, { onlyObjectValues: onlyObjectValues, skip: options.skipValidation }, function( err, updateObject, errors ){

      // If there is an error, end of story
      // If validation fails, call callback with self.SchemaError
      if( err ) return cb( err );

     if( errors.length ){ 
        var schemaError = new self.SchemaError( { errors: errors } );
        schemaError.errors = errors;
        return cb( schemaError );
      } 

      // The _id field cannot be updated. If it's there,
      // simply delete it
      delete updateObject[ '_id' ];

      // Add __uc__ fields to the updateObject (they are the uppercase fields
      // used for filtering of string fields)
      self._addUcFields( updateObject );

      // If `options.deleteUnsetFields`, Unset any value that is not actually set but IS in the schema,
      // so that partial PUTs will "overwrite" whole objects rather than
      // just overwriting fields that are _actually_ present in `body`
      if( options.deleteUnsetFields ){
        Object.keys( self._fieldsHash ).forEach( function( i ){
           if( typeof( updateObject[ i ] ) === 'undefined' && i !== '_id' && i !== self.positionField ){
             unsetObject[ i ] = 1;

             // Get rid of __uc__ objects if the equivalent field was out
             if( self._searchableHash[ i ] === 'upperCase' && unsetObject[ i ] ){
               unsetObject[ '__uc__' + i ] = 1;
             }

           }
        });
      }

      // Make up parameters from the passed filters
      try {
        var mongoParameters = self._makeTingoParameters( filters );
      } catch( e ){
        return cb( e );
      }

      

      consolelog( rnd, "About to update. At this point, updateObject is:", updateObject );
      consolelog( rnd, "Selector:", mongoParameters.querySelector );

      self._makeUpdateObjectWithLookups( updateObject, function( err, updateObjectWithLookups ){
        if( err ) return cb( err );

        consolelog( rnd, "Update object with lookups:", updateObjectWithLookups );

        // If options.multi is off, then use findAndModify which will accept sort
        if( !options.multi ){

          self.collection.findAndModify( mongoParameters.querySelector, mongoParameters.sortHash, { $set: updateObjectWithLookups, $unset: unsetObject }, function( err, doc ){
            if( err ) return cb( err );

            if( doc ){

              // MONGO: Change parents so that the one record is updated
              self._updateParentsRecords( { op: 'updateOne', id: doc[ self.idProperty ], updateObject: updateObject, unsetObject: unsetObject }, function( err ){
                if( err ) return cb( err );

                cb( null, 1 );
              });
            } else {
              cb( null, 0 );
            }
          });

        // If options.multi is on, then "sorting" doesn't make sense, it will just use mongo's "update"
        // (With SimpleDbLayer you cannot decide to do  mass update un a limited number of records)
        } else {

          // Run the query
          self.collection.update( mongoParameters.querySelector, { $set: updateObjectWithLookups, $unset: unsetObject }, { multi: true }, function( err, total ){
            if( err ) return cb( err );

            // MONGO: Change parents
            self._updateParentsRecords( { op: 'updateMany', filters: filters, updateObject: updateObject, unsetObject: unsetObject }, function( err ){
              if( err ) return cb( err );

              cb( null, total );
            });
          });
        };

      });
    });

  },


  insert: function( record, options, cb ){

    var self = this;
    var recordWithLookups = {};


    var rnd = Math.floor(Math.random()*100 );
    consolelog( "\n");
    consolelog( rnd, "ENTRY: insert for ", self.table, ' => ', record );

    // Usual drill
    if( typeof( cb ) === 'undefined' ){
      cb = options;
      options = {}
    } else if( typeof( options ) !== 'object' || options === null ){
      return cb( new Error("The options parameter must be a non-null object") );
    }

    // Validate the record against the schema
    self.schema.validate( record, { skip: options.skipValidation }, function( err, record, errors ){

      // If there is an error, end of story
      // If validation fails, call callback with self.SchemaError
      if( err ) return cb( err );
      
      if( errors.length ){
        var schemaError = new self.SchemaError( { errors: errors } );
        schemaError.errors = errors;
        return cb( schemaError );
      }

      // Copy record over, only for existing fields
      // Deleted, as at this point if a field doesn't belong to the schema
      // an exception will be raised
      //for( var k in record ){
      //  if( typeof( self._fieldsHash[ k ] ) !== 'undefined' ) recordCleanedUp[ k ] = record[ k ];
      //}

      consolelog( rnd, "record after validation:", record );

      // Add __uc__ fields to the record
      self._addUcFields( record );

      consolelog( rnd, "record with __uc__ fields:", record );
 
      self._makeRecordWithLookups( record, function( err, recordWithLookups ){
        if( err ) return cb( err );
     
        consolelog( rnd, "recordWithLookups is:", recordWithLookups);

        // Every record in Tingo MUST have an _id field. Note that I do this here
        // so that record doesn't include an _id field when self._makeRecordWithLookups
        // is called (which would imply that $pushed, non-main children elements would also
        // have _id
        if( typeof( recordWithLookups._id ) === 'undefined' ) recordWithLookups._id  = ObjectId();

        consolelog( rnd, "record with _id added:", record );

        // Actually run the insert
        self.collection.insert( recordWithLookups, function( err ){
          if( err ) return cb( err );

          self._updateParentsRecords( { op: 'insert', record: record }, function( err ){
            if( err ) return cb( err );

            if( ! options.returnRecord ) return cb( null );

            self.collection.findOne( { _id: recordWithLookups._id }, self._projectionHash, function( err, doc ){
              if( err ) return cb( err );

              if( doc !== null && typeof( self._fieldsHash._id ) === 'undefined' ) delete doc._id;

              cb( null, doc );
            });
          });
        });
      });
    });
  },


  'delete': function( filters, options, cb ){

    var self = this;

    var rnd = Math.floor(Math.random()*100 );
    consolelog( "\n");
    consolelog( rnd, "ENTRY: delete for ", self.table, ' => ', filters );

    // Usual drill
    if( typeof( cb ) === 'undefined' ){
      cb = options;
      options = {}
    } else if( typeof( options ) !== 'object' || options === null ){
      return cb( new Error("The options parameter must be a non-null object") );
    }

    // Run the query
    try { 
      var mongoParameters = this._makeTingoParameters( filters );
    } catch( e ){
      return cb( e );
    }

    // If options.multi is off, then use findAndModify which will accept sort
    if( !options.multi ){
      self.collection.findAndRemove( mongoParameters.querySelector, mongoParameters.sortHash, function( err, doc ) {
        if( err ) return cb( err );

        if( doc ){

          self._updateParentsRecords( { op: 'deleteOne', id: doc[ self.idProperty ] }, function( err ){
            if( err ) return cb( err );

            cb( null, 1 );
          });

        } else {
          cb( null, 0 );
        }
      });

    // If options.multi is on, then "sorting" doesn't make sense, it will just use mongo's "remove"
    } else {
      self.collection.remove( mongoParameters.querySelector, { single: false }, function( err, total ){
 
        self._updateParentsRecords( { op: 'deleteMany', filters: filters }, function( err ){
          if( err ) return cb( err );
         
          cb( null, total );
        });
 
      });
    }

  },

  reposition: function( record, moveBeforeId, cb ){


    // No position field: nothing to do
    if( ! this.positionField ){
       consolelog("No positionField for this table:", this.table );
       return cb( null );
    }

    // moveBeforeId is 
    if( typeof( moveBeforeId ) === 'undefined' ){
       consolelog("beforeId is undefined, skipping repositioning" );
       return cb( null );
    }

    consolelog("Repositioning:", record );

    function moveElement(array, from, to) {
      if( to !== from ) array.splice( to, 0, array.splice(from, 1)[0]);
    }

    var self = this;

    var positionField = self.positionField;
    var idProperty = self.idProperty;
    var conditionsHash = {};
    var id = record[ idProperty ];

    var updateCalls = [];

    // Make up conditionsHash based on the positionBase array
    var conditionsHash = { and: [] };
    for( var i = 0, l = self.positionBase.length -1; i < l; i ++ ){
      var positionBaseField = self.positionBase[ i ];
      conditionsHash.and.push( { field: positionBaseField, type: 'eq', value: record[ positionBaseField ] } );
    }

    consolelog("Repositioning basing it on", positionField, "idProperty: ", idProperty, "id: ", id, "to go after:", moveBeforeId );

    // Run the select, ordered by the positionField and satisfying the positionBase
    var sortParams = { };
    sortParams[ positionField ] = 1;
    self.select( { sort: sortParams, conditions: conditionsHash }, { skipHardLimitOnQueries: true }, function( err, data ){
      if( err ) return cb( err );

      consolelog("Data before: ", data );
      
      // Working out `from` and `to` as positional numbers
      var from, to;
      data.forEach( function( a, i ){ if( a[ idProperty ].toString() == id.toString() ) from = i; } );
      consolelog("Move before ID: ", moveBeforeId, typeof( moveBeforeId )  );
      if( typeof( moveBeforeId ) === 'undefined' || moveBeforeId === null ){
        consolelog( "moveBeforeId was null, 'to' will be:" , data.length );
        to = data.length;
      } else {
        consolelog("moveBeforeId was passed, looking for item...");
        data.forEach( function( a, i ){ if( a[ idProperty ].toString() == moveBeforeId.toString() ) to = i; } );
      }

      consolelog("from: ", from, ", to: ", to );

      // Actually move the elements
      if( typeof( from ) !== 'undefined' && typeof( to ) !== 'undefined' ){
        consolelog("Swapping!!!");

        if( to > from ) to --;
        moveElement( data, from, to);

        consolelog("Data after: ", data );

        // Actually change the values on the DB so that they have the right order
        var updateCalls = [];
        data.forEach( function( item, i ){

          consolelog("Item: ", item, i );
          var updateTo = {};
          updateTo[ positionField ] = i + 100;

          updateCalls.push( function( cb ){
            var mongoSelector = {};
            mongoSelector[ idProperty ] = item[ idProperty ];
            consolelog("Updating...", mongoSelector, { $set: updateTo } );
            self.collection.update( mongoSelector, { $set: updateTo }, cb );
          });

        });
        
        // Runs the updates in series, calling the final callback at the end
        async.series( updateCalls , cb );
        // cb( null );

      } else {

        // Something went wrong, no changes will be made
        cb( null );
      }

    });     
    

  },

  dropIndex: function( name, cb ){

    this.collection.dropIndex( name );

    // The mongo call is synchronous, call callback manually
    cb( null );
  },
    
  dropAllIndexes: function( done ){
    this.collection.dropAllIndexes( done );
  },

  makeIndex: function( keys, name, options, cb ){
    //consolelog("MONGODB: Called makeIndex in collection ", this.table, ". Keys: ", keys );
    var opt = {};

    consolelog("Making indexes for table", this.table, "and keys:");
    consolelog( keys );
    consolelog("And options:");
    consolelog( options );

    if( typeof( options ) === 'undefined' || options === null ) options = {};
    opt.background = !!options.background;
    opt.unique = !!options.unique;
    if( typeof( name ) === 'string' )  opt.name = name;

    this.collection.ensureIndex( keys, opt, function( err ){
      if( err ) return cb( err );

      cb( null );
    });
  },

  // Make all indexes based on the schema
  // Options can have:
  //   `{ background: true }`, which will make sure makeIndex is called with { background: true }
  //
  // NOTE TO Db Layer DEVELOPERS USING THIS AS A TEMPLATE:
  // I used the _indexGroups variable as mongoDB requires very specific indexing (each record "contains"
  // its children directly, and the children's fields also need to be indexed within the parent).
  // In normal circumstances, just scan the layer's schema for anything `searchable`.

  generateSchemaIndexes: function( options, cb ){

    var self = this;
    var indexMakers = [];

    var opt = {};
    if( options.background ) opt.background = false;

    consolelog("Run generateSchemaIndexes for table", self.table );

    /*

     Go through all of the index groups for this table.
     Assume you have schemas as follows:

     people = declare( DbLayer, {

       schema: new Schema({
         workspaceId: { type: 'id', searchable: true },
         id:          { type: 'id', searchable: true },
         name:        { type: 'string', searchable: true },
         surname:     { type: 'string', searchable: true },
         age:         { type: 'number', searchable: true, sortable: true },
       }),

     });
       
     emails = declare( DbLayer, {

       schema: new Schema({
         workspaceId: { type: 'id', searchable; true },
         id:          { type: 'id', searchable: true },
         personId:    { type: 'id', searchable: true },
         email:       { type: 'string', searchable: true },
         active:      { type: 'boolean', searchable: true },
         notes:       { type: 'string' }
       }),

     });

     Also assume that `emails` is nested to `people`.

     The end result will be:

     // peopleSchema

     _indexGroups = {
       __main: {
         searchable: { workspaceId: true, id: true, name: true, surname: true, age: true },
       },

       __emails: {
         searchable: { workspaceId: true, id: true, personId: true, email: true, active: true },
       }
     }
    */

    consolelog("indexGroups for: ", self.table );
    consolelog(self._indexGroups );

    // Go through each group
    Object.keys( self._indexGroups ).forEach( function( group ){

      var indexGroup = self._indexGroups[ group ];

      consolelog("Dealing with group: ", group );

      // Sets the field prefix. For __main, it's empty.
      fieldPrefix = group === '__main' ? '' : group + '.';

      consolelog("fieldPrefix:", fieldPrefix );

      // Go through `searchable` values. For each one,
      // add the index.

      Object.keys( indexGroup.searchable ).forEach( function( searchable ){

        consolelog("Searchable field:", searchable );

        var entryValue = indexGroup.searchable[ searchable ];
        consolelog("Entry valu:", entryValue );

        // Add the __uc prefix (if necessary), as well as the
        // path prefix (in case it's not __main)
        if( entryValue === 'upperCase' ){
          searchable = self._addUcPrefixToPath( searchable );
        }
        searchable = fieldPrefix + searchable;

        // Turn it into a proper field path (it will only affect fields with "." in them)
        searchable = self._makeTingoFieldPath( searchable );

        var indexKeys = {};

        // Adding index maker for the straight search
        indexKeys[ searchable ] = 1;
        indexMakers.push( function( cb ){
          consolelog("Running makeIndex for table/keys:", self.table, indexKeys );
          self.makeIndex( indexKeys, null, opt, cb );
        });

      });
    });


    // Add index for positionField, keeping into account positionBaseField
    var keys = {};
    self.positionBase.forEach( function( positionBaseField ){
      keys[ positionBaseField ] = 1;
    });
    keys[ self.positionField ] = 1;
    indexMakers.push( function( cb ){
      self.makeIndex( keys, null, opt, cb );
    });

    // All done: now _actually_ create the indexes
    // (indexMarkers is an array of callbacks, each one creating one index)
    async.series( indexMakers, cb );
  },


  // ******************************************************************
  // ******************************************************************
  // ****              MONGO-SPECIFIC FUNCTIONS                    ****
  // ****              FOR JOINS AND UPPERCASING                   ****
  // ****                                                          ****
  // **** These functions are here to address mongoDb's lack of    ****
  // **** joins by manipulating records' contents when a parent    ****
  // **** record is added, as well as helper functions for         ****
  // **** the lack, in TingoDB, of case-independent searches.      ****
  // ****                                                          ****
  // **** For lack of  case-insensitive search, the layer creates  ****
  // **** __uc__ fields that are uppercase equivalent of 'string'  ****
  // **** fields in the schema.                                    ****
  // ****                                                          ****
  // **** About joins, if you have people and each person can have ****
  // **** several email addresses, when adding an email address    ****
  // **** the "parent" record will have the corresponding          ****
  // **** array in _children updated with the new email address    ****
  // **** added. This means that when fetching records, you        ****
  // **** _automatically_ and _immediately_ have its children      ****
  // **** loaded. It also means that it's possible, in TingoDb,    ****
  // **** to search for fields in the direct children              ****
  // **** I took great care at moving these functions here         ****
  // **** because these are the functions that developers of       ****
  // **** other layer drivers will never have to worry about       ****
  // ****                                                          ****
  // ******************************************************************
  // ******************************************************************


  _deleteUcFieldsfromChildren: function( _children ){
    var self = this;

    for( var k in _children ){
      var child = _children[ k ];
      if( Array.isArray( child ) ){
        for( var i = 0, l = child.length; i < l; i++ ){
          self._deleteUcFields( child[ i ] );
        }
      } else {
        self._deleteUcFields( child );
      }
    };
  },

   _deleteUcFields: function( record ){
    var self = this;

    for( var k in record ){
      if( k.substr( 0, 6 ) === '__uc__' ) delete record[ k ];
    }

  },

 

  _addUcFields: function( record ){
    var self = this;

    for( var k in record ){
      if( self._searchableHash[ k ] === 'upperCase' ){
        record[ '__uc__' + k ] = record[ k ].toUpperCase();
      }
    }
  },

  // If there are ".", then some children records are being referenced.
  // The actual way they are placed in the record is in _children; so,
  // add _children where needed.
  _makeTingoFieldPath: function( s ){

    if( s.match(/\./ ) ){

      var l = s.split( /\./ );
      for( var i = 0; i < l.length-1; i++ ){
        l[ i ] = '_children.' + l[ i ];
      }
      return l.join( '.' );

    } else {
      return s;
    }
   
  },

  _addUcPrefixToPath: function( s ){
    var a = s.split('.');
    a[ a.length - 1 ] = '__uc__' + a[ a.length - 1 ];
    return a.join('.');
  },



  _makeRecordWithLookups: function( record, cb ){

    var self = this;

    var rnd = Math.floor(Math.random()*100 );
    consolelog( "\n");
    consolelog( rnd, "ENTRY:  _makeRecordWithLookups for ", self.table, 'record:',  record );

    var recordWithLookups = {};

    // Prepare recordWithLookups, as a copy of record
    for( var k in record ){
      recordWithLookups[ k ] = record[ k ];
    }

    // Each added record needs to be ready for its _children
    recordWithLookups._children = {};

    // Prepare the ground: for each child table of type "multiple", add an
    // empty value in recordWithLookups.[children & searchData] as an empty
    // array. Future updates and inserts might add/delete/update records in there
    Object.keys( self.childrenTablesHash ).forEach( function( k ){
      if( self.childrenTablesHash[ k ].nestedParams.type === 'multiple' ){
        recordWithLookups._children[ k ] = [];
      } 
    });

    // Cycle through each lookup child of the current record,
    async.eachSeries(
      Object.keys( recordWithLookups ),

      function( recordKey, cb ){
      
        //consolelog( rnd, "Checking that field", recordKey, "is actually a lookup table...");
        if( ! self.lookupChildrenTablesHash[ recordKey ] ){
          //consolelog( rnd, "It isn't! Ignoring it...");
          return cb( null );
        } else {
          consolelog( rnd, "It is! Processing it...");
          consolelog( rnd, recordKey, "Is a lookup table!");

          var childTableData = self.lookupChildrenTablesHash[ recordKey ];

          var childLayer = childTableData.layer;
          var nestedParams = childTableData.nestedParams;

          consolelog( rnd, "Working on ", childTableData.layer.table );
          consolelog( rnd, "Getting children data in child table ", childTableData.layer.table," for field ", nestedParams.parentField ," for record", recordWithLookups );

          // EXCEPTION: check if the record being looked up isn't the same as the one
          // being added. This is an edge case, but it's nice to cover it
          if( childLayer.table === self.table && recordWithLookups[ self.idProperty ] === recordWithLookups[ recordKey ] ){

            // Make up a temporary copy of the record, to which _children and __uc__ fields
            // will be added
            var t = {};
            for( var k in record ) t[ k ] = record[ k ];
            childLayer._addUcFields( t );
            t._children = {};
            recordWithLookups._children[ recordKey ] = t;
        
            return cb( null );
          }

          // Get children data for that child table
          // ROOT to _getChildrenData
          self._getChildrenData( recordWithLookups, recordKey, function( err, childData){
            if( err ) return cb( err );

            childLayer._addUcFields( childData );
            childData._children = {};

            consolelog( rnd, "The childData data is:", childData );

             // Make the record uppercase since it's for a search
            recordWithLookups._children[ recordKey ] = childData;

            // That's it!
            cb( null );
          });

        }
      },

      // End of cycle: function can continue

      function( err ){
        if( err ) return cb( err );

        consolelog( rnd, "About to insert. At this point, recordWithLookups is:", recordWithLookups );

        cb( null, recordWithLookups );
      }
    );
  },

  _makeUpdateObjectWithLookups: function( updateObject, cb ){
    var self = this;

    var rnd = Math.floor(Math.random()*100 );
    consolelog( "\n");
    consolelog( rnd, "ENTRY:  _makeUpdateObjectWithLookups for ", self.table, 'updateObject:',  updateObject );

    // Make a copy of the original updateObject. The copy will be
    // enriched and will then be returned
    var updateObjectWithLookups = {};
    for( var k in updateObject ) updateObjectWithLookups[ k ] = updateObject[ k ];

    // This is only for aesthetic purposes. In an update, the update object
    // "is" the record (although it might be a partial version of it)
    var record = updateObject;

    // Cycle through each lookup child of the update object
    async.eachSeries(
      Object.keys( record ),

      function( recordKey, cb ){
      
        //consolelog( rnd, "Checking that field", recordKey, "is actually a lookup table...");
        if( ! self.lookupChildrenTablesHash[ recordKey ] ){
          //consolelog( rnd, "It isn't! Ignoring it...");
          return cb( null );
        } else {
          consolelog( rnd, recordKey, "Is a lookup table!");

          var childTableData = self.lookupChildrenTablesHash[ recordKey ];

          var childLayer = childTableData.layer;
          var nestedParams = childTableData.nestedParams;

          consolelog( rnd, "Working on ", childTableData.layer.table );
          consolelog( rnd, "Getting children data in child table ", childTableData.layer.table," for field ", nestedParams.parentField ," for record", record );

          // Get children data for that child table
          // ROOT to _getChildrenData
          self._getChildrenData( record, recordKey, function( err, childData){
            if( err ) return cb( err );

            childLayer._addUcFields( childData );
            childData._children = {};

            consolelog( rnd, "The childData data is:", childData );

            updateObjectWithLookups[ '_children.' + recordKey ] = childData;

            // That's it!
            cb( null );
          });

        }
      },

      // End of cycle: function can continue

      function( err ){
        if( err ) return cb( err );

        cb( null, updateObjectWithLookups );
      }
    );

  },


  /* This function takes a layer, a record and a child table, and
     returns children data about that field.
     The return value might be an array (for 1:n relationships) or a
     straight object (for lookups);

     NOTE: In mongoDbLayer, this function is only really used for lookups
     as 1:n sub-records are obviously only added to the master one when the
     sub-record is added.
  */
  _getChildrenData: function( record, field, cb ){

    var self = this;

    // The layer is the object from which the call is made
    var layer = this;

    var rnd = Math.floor(Math.random()*100 );
    consolelog( "\n");
    consolelog( rnd, "ENTRY: _getChildrenData for ", field, ' => ', record );
    //consolelog( rnd, "Comparing with:", Object.keys( rootTable.autoLoad ) );

    // Little detail forgotten by accident
    var resultObject;

    var childTableData = self.childrenTablesHash[ field ]; 

    // If it's a lookup, it will be v directly. This will cover cases where a new call
    // is made straight on the lookup
    switch( childTableData.nestedParams.type ){

      case 'multiple':
        consolelog( rnd, "Child table to be considered is of type MULTIPLE" );
        resultObject = [];
      break;

      case 'lookup':
        consolelog( rnd, "Child table to be considered is of type LOOKUP" );
        resultObject = {};
      break;
    }
   
    // JOIN QUERY (direct)
    var mongoSelector = {};
    Object.keys( childTableData.nestedParams.join ).forEach( function( joinKey ){
      var joinValue = childTableData.nestedParams.join[ joinKey ]
      mongoSelector[ joinKey ] = record[ joinValue ];
    });
    
    consolelog( rnd, "Running the select with selector:", mongoSelector, "on table", childTableData.layer.table );

    // Runs the query, which will get the children element for that
    // child table depending on the join
    //childTableData.layer.collection.find( { conditions: { and: andConditionsArray } }, function( err, res, total ){
    childTableData.layer.collection.find( mongoSelector, childTableData.layer._projectionHash ).toArray( function( err, res ){
      if( err ) return cb( err );

      consolelog( rnd, "Records fetched:", res );
   
      // For each result, add them to resultObject
      async.eachSeries(
        res,
    
        function( item, cb ){

          // Since we are doing a find directly, we need to take out _id manually if
          // it's not in the projection hash
          if( typeof( childTableData.layer._fieldsHash._id ) === 'undefined' )  delete item._id;


          consolelog( rnd, "Considering item:", item );
   
          // Assign the loaded item to the resultObject
          // making sure that it's in the right spot (depending on the type)
          switch( childTableData.nestedParams.type ){
            case 'lookup':
             //var loadAs = childTableData.nestedParams.loadAs ? childTableData.nestedParams.loadAs : childTableData.nestedParams.layer.table;
             var loadAs = childTableData.nestedParams.parentField;
             consolelog( rnd, "Item is a lookup, assigning resultobject[ ", loadAs,' ] to ', resultObject );
             resultObject = item;
            break;
            case 'multiple':
              consolelog( rnd, "Item is of type multiple, pushing it to", resultObject );
              resultObject.push( item );
            break;
            default:
              cb( new Error( "Parameter 'type' needs to be 'lookup' or 'multiple' " ) );
            break;
          };

          consolelog( rnd, "resultObject after the cure is:", resultObject );

          cb( null );
            
        },

        function( err ){
          if( err ) return cb( err );

          consolelog( rnd, "EXIT: End of function. Returning:", require('util').inspect( resultObject, { depth: 5 }  ) );

          cb( null, resultObject );
        }
      ) // async.series

    })
  },



  /*
   This function will update each parent record so that it contains
   up-to-date information about its children.
   If you update a child record, any parent containing a reference to it
   will need to be updated.
   This is built to be _fast_: there is only one extra update for each
   parent table. 
  */
  _updateParentsRecords: function( params, cb ){

    var self = this;
    var layer = this;

    // Paranoid checks and sane defaults for params
    if( typeof( params ) !== 'object' || params === null ) params = {};

    var rnd = Math.floor(Math.random()*100 );
    consolelog( "\n");
    consolelog( rnd, "ENTRY: _updateParentsRecords on table", self.table );
    consolelog( rnd, 'Params:' );
    consolelog( require('util').inspect( params, { depth: 10 } ) );

    consolelog( rnd, "Cycling through: ", self.parentTablesArray );

    // Cycle through each parent of the current layer
    async.eachSeries(
      self.parentTablesArray,
      function( parentTableData, cb ){
    
        consolelog( rnd, "Working on ", parentTableData.layer.table );
 
        var parentLayer = parentTableData.layer;
        var nestedParams = parentTableData.nestedParams;

        
        // If it's not meant to be searchable, skip it
        //if( ! nestedParams.searchable && params.field === '_searchData' ){
        //  consolelog( rnd, "Child table doesn't have searchable and _searchData was to be populated, skipping..." );
        //  return cb( null );
        //}

        // Figure out what to pass as the second parameter of _getChildrenData: 
        // - For multiple, it will just be the table's name
        // - For lookups, it will be the parentField value in nestedParams
        var field;
        switch( nestedParams.type ){
          case 'multiple': field = self.table; break;
          case 'lookup'  : field = nestedParams.parentField; break;
          default        : return cb( new Error("The options parameter must be a non-null object") ); break;
        }
        consolelog( rnd, "field for ", nestedParams.type, "is:", field );

        /* THREE CASES:
          * CASE #1: Insert
          * CASE #2: Update
          * CASE #3: Delete

                              *** DO NOT OPTIMISE THIS CODE ***

          I REPEAT: DO NOT OPTIMISE THIS CODE.
          This code has the potential to become the most uncomprehensible thing ever written. Worse than Perl.
          Optimising here is simple -- and even tempting. DON'T. Clarity here is MUCH more important than
          terseness.
        */

        // CASE #1 -- INSERT

        if( params.op === 'insert' ){

          if( nestedParams.type === 'multiple' ){

            consolelog( rnd, "CASE #1 (insert, multiple)" );

            // Assign the parameters
            var record = params.record;

            // JOIN QUERY (reversed, look for parent)
            var mongoSelector = {};
            Object.keys( nestedParams.join ).forEach( function( joinKey ){
              mongoSelector[ nestedParams.join[ joinKey ] ] = record[ joinKey ];
            });

            // The updateRecord variable is the same as record, but with uc fields and _children added
            var insertRecord = {};
            for( var k in record ) insertRecord[ k ] = record[ k ];
            self._addUcFields( insertRecord );
            insertRecord._children = {};

            var updateObject = { '$push': {} };
            updateObject[ '$push' ] [ '_children' + '.' + field ] = { '$each': [ insertRecord ], '$slice': -1000 };

            consolelog( rnd, "The mongoSelector is:", mongoSelector  );
            consolelog( rnd, "The update object is: ");
            consolelog( require('util').inspect( updateObject, { depth: 10 } ) );

            parentLayer.collection.update( mongoSelector, updateObject, function( err, total ){
              if( err ) return cb( err );

              consolelog( rnd, "Record inserted in sub-array" );

              cb( null );
           
            });

          // noop
          } else if( nestedParams.type === 'lookup' ){

            return cb( null );
          }

        // CASE #2 -- UPDATE

        } else if( params.op === 'updateOne' || params.op === 'updateMany' ){

          if( params.op === 'updateOne' ){

            consolelog( rnd, "CASE #2 (updateOne)", params.op );
            
            // Assign the parameters
            var id = params.id;
            var updateObject = params.updateObject;
            var unsetObject = params.unsetObject;
 
            var prefix = '_children.' + field + ( nestedParams.type === 'multiple' ?  '.$.' : '.' ) ;

            // Make up relative update objects based on the original ones,
            // with extra path added
            var relativeUpdateObject = {};
            for( var k in updateObject ){
              relativeUpdateObject[ prefix + k ] = updateObject[ k ];
            }
            var relativeUnsetObject = {};
            for( var k in unsetObject ){
              relativeUnsetObject[ prefix + k ] = unsetObject[ k ];
            }

            var selector = {};
            selector[ '_children.' + field + "." + self.idProperty ] = id;
            consolelog( rnd, "SELECTOR:" );
            consolelog( rnd, selector );

            parentLayer.collection.update( selector, { $set: relativeUpdateObject, $unset: relativeUnsetObject }, { multi: true }, function( err, total ){
              if( err ) return cb( err );

              consolelog( rnd, "Updated:", total, "records" );

              return cb( null );

            });
          }

          if( params.op === 'updateMany' ){

            consolelog( rnd, "CASE #2 (updateMany)", params.op );

            // Sorry, can't. TingoDb bug #1243
            if( nestedParams.type === 'multiple' ){
              cb( new Error("You cannot do a mass update of a table that has a father table with 1:n relationship with it. Ask Tingo people to fix https://jira.mongodb.org/browse/SERVER-1243, or this is unimplementable") );
            }

            // Assign the parameters
            var filters = params.filters;
            var updateObject = params.updateObject;
            var unsetObject = params.unsetObject;


            // Make up parameters from the passed filters
            try {
              var mongoParameters = parentLayer._makeTingoParameters( filters, field );
              // var mongoParameters = parentLayer._makeTingoParameters( filters );
            } catch( e ){
              return cb( e );
            }

            consolelog( rnd,  "mongoParameters:" );
            consolelog( mongoParameters.querySelector );

            var prefix = '_children.' + field + ( nestedParams.type === 'multiple' ?  '.$.' : '.' );

            // Make up relative update objects based on the original ones,
            // with extra path added
            var relativeUpdateObject = {};
            for( var k in updateObject ){
              relativeUpdateObject[ prefix + k ] = updateObject[ k ];
            }
            var relativeUnsetObject = {};
            for( var k in unsetObject ){
              relativeUnsetObject[ prefix + k ] = unsetObject[ k ];
            }

            consolelog( rnd,  "updateObject:" );
            consolelog( relativeUpdateObject );

            parentLayer.collection.update( mongoParameters.querySelector, { $set: relativeUpdateObject, $unset: relativeUnsetObject }, { multi: true }, function( err, total ){
            
              if( err ) return cb( err );
              consolelog( rnd, "Updated:", total, "records" );
            
              return cb( null );
            });


          }

        // CASE #3 -- DELETE
        } else if( params.op === 'deleteOne' || params.op === 'deleteMany' ){

          if( params.op === 'deleteOne' ){

            consolelog( rnd, "CASE #3 (deleteOne)", params.op );

            // Assign the parameters
            var id = params.id;

            var updateObject = {};

            var selector = {};
            selector[ '_children.' + field + "." + self.idProperty ] = id;

            // It's a lookup field: it will assign an empty object
            if( nestedParams.type === 'lookup' ){
              updateObject[ '$set' ] = {};
              updateObject[ '$set'] [ '_children.' + field ] = {};

            // It's a multiple one: it will $pull the element out
            } else {
              updateObject[ '$pull' ] = {};

              var pullData = {};
              // TODO: CHECK IF THIS SHOULD BE self.idProperty OR parentLayer.idProperty
              pullData[ self.idProperty  ] =  id ;
              updateObject[ '$pull' ] [ '_children.' + field ] = pullData;
            }

            consolelog( rnd, "Selector:");
            consolelog( selector );
            consolelog( rnd, "UpdateObject:");
            consolelog( updateObject );

            parentLayer.collection.update( selector, updateObject, { multi: true }, function( err, total ){
              if( err ) return cb( err );

              consolelog( rnd, "Deleted", total, "sub-records" );

              return cb( null );

            });
          }

          if( params.op === 'deleteMany' ){

            consolelog( rnd, "CASE #3 (deleteMany)", params.op );

            // Assign the parameters
            var filters = params.filters;

            // Make up parameters from the passed filters
            try {
              var mongoParameters = parentLayer._makeTingoParameters( filters, field );
            } catch( e ){
              return cb( e );
            }

            // Make up parameters from the passed filters
            try {
              var mongoParametersForPull = parentLayer._makeTingoParameters( filters );
            } catch( e ){
              return cb( e );
            }


            // The update object will depend on whether it's a push or a pull
            var updateObject = {};

            // It's a lookup field: it will assign an empty object
            // Note that we don't need the "ugly hack" here (_mongoUglyUpdateWrapper) as the update
            // only counts for one field per parent
            if( nestedParams.type === 'lookup' ){
              updateObject[ '$set' ] = {};
              updateObject[ '$set'] [ '_children.' + field ] = {};

              parentLayer.collection.update( mongoParameters.querySelector, updateObject, { multi: true }, function( err, total ){
                if( err ) return cb( err );
                consolelog( rnd, "deleted", total, "sub-records" );

                return cb( null );
              });

            // It's a multiple one: it will $pull the elementS (with an S, plural) out
            // Note that we don't need the "ugly hack" here (_mongoUglyUpdateWrapper) as the $pull operation in TingoDB
            // takes a condition itself -- condition that I replicate
            } else {
              updateObject[ '$pull' ] = {};
              updateObject[ '$pull' ] [ '_children.' + field ] = mongoParametersForPull.querySelector;

              parentLayer.collection.update( mongoParameters.querySelector, updateObject, { multi: true }, function( err, total ){
                if( err ) return cb( err );
                consolelog( rnd, "deleted", total, "sub-records" );
            
                return cb( null );
              });
            }

          }

        // CASE #? -- This mustn't happen!
        } else {
          consolelog( rnd, "WARNING?!? params.op and nestedParams.type are:", params.op, nestedParams.type );

          cb( null );
        }

      },
    
      function( err ){
        if( err ) return cb( err );
        consolelog( rnd, "EXIT: End of function ( _updateParentsRecords)" );
        cb( null );
      }
    );

  },

});

// The default id maker
TingoMixin.makeId = function( id, cb ){
  if( id === null ){
    cb( null, ObjectId() );
  } else {
    cb( null, ObjectId( id ) );
  }
},



exports = module.exports = TingoMixin;

