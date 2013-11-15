define(["require", "DQX/base64", "DQX/Application", "DQX/Framework", "DQX/Controls", "DQX/Msg", "DQX/SQL", "DQX/QueryTable", "DQX/QueryBuilder", "DQX/DataFetcher/DataFetchers", "DQX/DocEl", "DQX/Utils", "DQX/Wizard", "DQX/Popup", "DQX/PopupFrame", "MetaData"],
    function (require, base64, Application, Framework, Controls, Msg, SQL, QueryTable, QueryBuilder, DataFetchers, DocEl, DQX, Wizard, Popup, PopupFrame, MetaData) {

        var EditTableBasedSummaryValues = {};

        EditTableBasedSummaryValues.storedValues = {};


        EditTableBasedSummaryValues.CreateDialogBox = function(tableid) {
            var that = PopupFrame.PopupFrame('EditTableBasedSummaryValues', {title:'Genome tracks', blocking:true, sizeX:700, sizeY:500 });
            that.tableInfo = MetaData.mapTableCatalog[tableid];

            that.createFrames = function() {
                that.frameRoot.makeGroupVert();
                that.frameQuery = that.frameRoot.addMemberFrame(Framework.FrameFinal('', 0.3))
                    .setFixedSize(Framework.dimY, 60).setFrameClassClient('DQXGrayClient');
                that.frameBody = that.frameRoot.addMemberFrame(Framework.FrameFinal('', 0.7))
                    .setAllowScrollBars(true,true);
                that.frameButtons = that.frameRoot.addMemberFrame(Framework.FrameFinal('', 0.3))
                    .setFixedSize(Framework.dimY, 70).setFrameClassClient('DQXGrayClient');
            };

            that.createPanels = function() {

                that.panelQuery = Framework.Form(that.frameQuery);
                var queries = [];
                that.queryControls = {};
                $.each(that.tableInfo.quickFindFields, function(idx, propid) {
                    var propInfo = MetaData.findProperty(that.tableInfo.id, propid);


                    if (!propInfo.propCategories) {
                        var ctrl = Controls.Edit(null,{size:18});
                    }
                    else {
                        var cats = [{id:'', name:'[All]'}];
                        $.each(propInfo.propCategories, function(idx, cat) {
                            cats.push({id:cat, name:cat});
                        });
                        var ctrl = Controls.Combo(null,{size:18, label:'', states:cats});
                    }
                    if (propid in EditTableBasedSummaryValues.storedValues)
                        ctrl.modifyValue(EditTableBasedSummaryValues.storedValues[propid])

                    ctrl.setOnChanged(DQX.debounce(that.updateQuery,200));
                    that.queryControls[propid] = ctrl;
                    queries.push(Controls.HorizontalSeparator(5));
                    queries.push(Controls.CompoundVert([
                        Controls.Static(propInfo.name+':'),
                        ctrl
                    ]).setTreatAsBlock());
                });
                that.panelQuery.addControl(Controls.CompoundHor(queries));

                //that.panelBody = Framework.Form(that.frameBody).setPadding(10);
                that.panelButtons = Framework.Form(that.frameButtons);

                var bt_clearall = Controls.Button(null, { buttonClass: 'DQXWizardButton', content: 'Clear all' }).setOnChanged(function() {
                    $.each(that.tableInfo.tableBasedSummaryValues, function(idx, summaryValue) {
                        summaryValue.selectionManager.clearAll();
                    });
                    that.myTable.render();
                });

                var bt_close = Controls.Button(null, { buttonClass: 'DQXWizardButton', content: 'Close', bitmap: DQX.BMP('ok.png'), width:80, height:25 }).setOnChanged(function() {
                    that.close();
                });

                that.panelButtons.addControl(Controls.CompoundHor([
                    Controls.HorizontalSeparator(7),
                    bt_clearall
                ]));
                that.panelButtons.addControl(Controls.AlignRight(Controls.CompoundHor([
                    bt_close,
                    Controls.HorizontalSeparator(7)
                ])));


                //Initialise the data fetcher that will download the data for the table
                if (!that.tableInfo.summaryValuesTableFetcher) {
                    that.tableInfo.summaryValuesTableFetcher = DataFetchers.Table(
                        MetaData.serverUrl,
                        MetaData.database,
                        that.tableInfo.id
                    );
                }

                that.panelTable = QueryTable.Panel(
                    that.frameBody,
                    that.tableInfo.summaryValuesTableFetcher,
                    { leftfraction: 50 }
                );
                that.myTable = that.panelTable.getTable();// A shortcut variable
                that.myTable.fetchBuffer = 300;
                that.myTable.immediateFetchRecordCount = false;
                that.myTable.setQuery(SQL.WhereClause.Trivial());


                //Create the selection columns for all genome tracks that are associated with records in this table
                $.each(that.tableInfo.tableBasedSummaryValues, function(idx, summaryValue) {
                    that.myTable.createSelectionColumn(
                        summaryValue.trackid,
                        summaryValue.trackname,that.tableInfo.id, that.tableInfo.primkey,
                        summaryValue.selectionManager,
                        function() {
                            that.myTable.render();
                        });
                });

                $.each(that.tableInfo.quickFindFields, function(idx, propid) {
                    var propInfo = MetaData.findProperty(that.tableInfo.id,propid);
                    var col = that.myTable.createTableColumn(
                        QueryTable.Column(
                            propInfo.name,propid,1),
                        'String',//!!! todo: adapt this to datatype, see TableViewer
                        true
                    );
                });


                that.updateQuery();
                that.panelTable.onResize();

            };

            that.updateQuery = function() {
                var qryList = [];
                $.each(that.tableInfo.quickFindFields, function(idx, propid) {
                    var propInfo = MetaData.findProperty(that.tableInfo.id, propid);
                    var value = that.queryControls[propid].getValue();
                    if (value) {
                        EditTableBasedSummaryValues.storedValues[propid] = value;
                        if (!propInfo.propCategories)
                            qryList.push(SQL.WhereClause.CompareFixed(propid, 'LIKE', '%'+value+'%'));
                        else
                            qryList.push(SQL.WhereClause.CompareFixed(propid, '=', value));
                    }
                    else {
                        delete EditTableBasedSummaryValues.storedValues[propid];
                    }
                });
                if (qryList.length>0)
                    var whc = SQL.WhereClause.AND(qryList);
                else
                    var whc = SQL.WhereClause.Trivial();
                that.myTable.setQuery(whc);
                that.myTable.reLoadTable();

            }

            that.onOK = function() {
                var query = that.builder.getQuery();
                that.close();
            }

            that.create();

            return that;
        }



        return EditTableBasedSummaryValues;
    });


