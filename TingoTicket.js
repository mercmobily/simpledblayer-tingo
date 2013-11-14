    
    var 
      dummy
    , Db = require('tingodb')().Db;
    ;
    
    
    var db = new Db('/tmp/tests', {});
    var c = db.collection( 'test' );
    
    
    function printErr( err ){
      if( err ){
        console.log("ERROR!");
        console.log( err );
      }
    }
    
    function populate( cb ){
    
      console.log("Zapping and populating the DB...");
      c.remove( {}, function( err ){
        c.insert( {  name: 'Chiara',    surname: 'Mobily',     age: 22 } , function( err ){
          c.insert( {  name: 'Tony',    surname: 'Mobily',     age: 37 } , function( err ){
            c.insert( {  name: 'Sara',    surname: 'Connor',     age: 37 } , function( err ){
              c.insert( {  name: 'Daniela',    surname: 'Mobily',     age: 37 } , function( err ){
                cb( err );
              })
            })
          })
        })
      })
    }
    
    function idProjection( cb ){
    
      c.find( {}, { name: 1, age: 1, _id: -1 }, function( err, res ){
        if( err ){
          cb( err );
        } else { 
          res.toArray( cb );
        }
          
      })  
    }
    
    
    function countResetsCursorWorks( cb ){
    
      cursor = c.find(  { }, { }  );
      
      cursor.count( function( err, total ){
        if( err ){
          cb( err );
        } else {
          console.log("TOTAL:");
          console.log( total );
    
          cursor.toArray( function( err, total ){
            if( err ){
              cb( err );
            } else { 
              cursor.count( cb );
            }
          
          })
        }
      })
    }
    
    function countResetsCursorDoesNotWork( cb ){
    
      //cursor = c.find(  { '$and': [ { name: 'Tony' }, { surname: 'Mobily' }, { age: 37 } ] }, { name: true, surname: true, age: true }   );
      cursor = c.find(  { name: 'Tony', surname: 'Mobily',  age: 37 }, { name: true, surname: true, age: true }   );
      
      cursor.count( function( err, total ){
        if( err ){
          cb( err );
        } else {
          console.log("RECORDS COUNTED:");
          console.log( total );
    
          cursor.toArray( function( err, total ){
            if( err ){
              cb( err );
            } else { 
              cursor.count( cb );
            }
          
          })
        }
      })
    }
    
    
    function sortOnlyOneField( cb ){
      c.find( {}, { sort: { surname: 1, name: 1 }  }, function( err, results ){
        if( err ){
          cb( err );
        } else {
           results.toArray( function( err, a ) {
             console.log("RESULTS SHOULD BE ORDERED BY SURNAME,NAME:");
             console.log( a );
             console.log();
             cb( null );
           });
        }
      });
    }
    
    function regexpBroken( cb ){
      // c.find( { '$and': [ { surname: { '$regex': /.*nor$/ } } ] } , function( err, results ){
      c.find( { surname: { '$regex': /.*nor$/ } }, function( err, results ){
        if( err ){
          cb( err );
        } else {
           results.toArray( function( err, a ) {
             console.log("RESULTS SHOULD BE LIMITED:");
             console.log( a );
             console.log();
             cb( null );
           });
        }
      });
    }
    
    
    
    
    populate( function( err ){
    
      idProjection( function( err ){
        printErr( err );
    
        countResetsCursorWorks( function( err ){
          printErr( err );
    
          countResetsCursorDoesNotWork( function( err ){
            printErr( err );
    
            sortOnlyOneField( function( err ){
              printErr( err );
    
              regexpBroken( function( err ){
                 printErr( err );
                 db.close();
              })   
            }); 
          });
        });
      });
    })
    
    
