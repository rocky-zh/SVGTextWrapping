(function(f, define){
    define([ "./kendo.dataviz", "./kendo.mobile" ], f);
})(function(){
    "bundle all";
}, typeof define == 'function' && define.amd ? define : function(_, f){ f(); });
