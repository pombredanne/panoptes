define(["require", "DQX/Application", "DQX/Framework", "DQX/Controls", "DQX/Msg", "DQX/DocEl", "DQX/Popup", "DQX/Utils", "DQX/SQL", "DQX/QueryTable", "DQX/QueryBuilder", "DQX/DataFetcher/DataFetchers",
    "MetaData",
    "Wizards/EditQuery", "Utils/QueryTool", "Utils/MiscUtils", "Utils/SelectionTools", "Utils/ButtonChoiceBox"
],
    function (require, Application, Framework, Controls, Msg, DocEl, Popup, DQX, SQL, QueryTable, QueryBuilder, DataFetchers,
              MetaData,
              EditQuery, QueryTool, MiscUtils, SelectionTools, ButtonChoiceBox
        ) {






        var TableViewerModule = {

            init: function (tableid) {
                // Instantiate the view object
                var inf = MetaData.getTableInfo(tableid);
                var that = Application.View(
                    'table_'+tableid,  // View ID
                    MetaData.getTableInfo(tableid).tableCapNamePlural
                );

                that.setEarlyInitialisation();
                that.tableid = tableid;
                that.tableInfo = MetaData.getTableInfo(tableid);
                that.theQuery = QueryTool.Create(tableid, {
                    hasSubSampler:that.tableInfo.settings.AllowSubSampling,
                    subSamplingOptions: QueryTool.getSubSamplingOptions_All()
                });
                MetaData.getTableInfo(that.tableid).tableViewer = that;

                Msg.listen('',{ type: 'SelectionUpdated'}, function(scope,tableid) {
                    if (that.tableid==tableid) {
                        if (that.selectedItemCountText)
                            that.selectedItemCountText.modifyValue(that.tableInfo.getSelectedCount() + ' selected');
                        if (that.myTable)
                            that.myTable.render();
                    }
                } );

                Msg.listen('', { type: 'PropertyContentChanged'}, function(scope, data) {
                    if (that.tableid==data.tableid) {
                        var col = that.panelTable.getTable().findColumn(data.propid);
                        if (col) {
                            that.panelTable.getTable().clearData();
                            that.panelTable.getTable().render();
                        }
                    }
                });

                if (MetaData.getTableInfo(that.tableid).hasGenomePositions) {
                    Msg.listen('',{type: 'ShowItemsInGenomeRange', tableid: that.tableid}, function(scope, info) {
                        if (info.preservecurrentquery)
                            var qry =that.theQuery.get();
                        else
                            var qry = SQL.WhereClause.Trivial();
                        qry = SQL.WhereClause.createValueRestriction(qry, that.tableInfo.ChromosomeField, info.chrom);
                        qry = SQL.WhereClause.createRangeRestriction(qry, that.tableInfo.PositionField, info.start, info.stop, true);
                        Msg.send({type: 'DataItemTablePopup'}, {
                            tableid: that.tableInfo.id,
                            query: qry,
                            title: that.tableInfo.tableCapNamePlural + ' in genomic region ' + info.chrom + ':' + info.start + ':' + info.stop
                        });
                    });

                }

                Msg.listen('',{type: 'ShowItemsInSimpleQuery', tableid: that.tableid}, function(scope, info) {
                    that.activateState();
                    var qry = SQL.WhereClause.CompareFixed(info.propid, '=', info.value);
                    that.theQuery.modify(qry);
                });

                Msg.listen('',{type: 'ShowItemsInQuery', tableid: that.tableid}, function(scope, info) {
                    that.activateState();
                    if (info.subSamplingOptions)
                        that.theQuery.setSubSamplingOptions(info.subSamplingOptions);
                    that.theQuery.modify(info.query);
                });

                that.storeSettings = function() {
                    var obj= {};
                    obj.tableSettings  = that.myTable.storeSettings();
                    obj.query = SQL.WhereClause.encode(that.theQuery.get());
                    obj.subsampling = that.theQuery.getSubSamplingOptions();
                    if (that.visibilityControlsGroup)
                        obj.activecolumns = Controls.storeSettings(that.visibilityControlsGroup);
                    return obj;
                };

                that.recallSettings = function(settObj) {
                    var qry = SQL.WhereClause.decode(settObj.query);
                    if (settObj.tableSettings) {
                        that.myTable.recallSettings(settObj.tableSettings);
                        that._storedTableSettings = settObj.tableSettings;
                    }
                    if (settObj.subsampling)
                        that.theQuery.setSubSamplingOptions(settObj.subsampling);
                    that.theQuery.modify(qry);
                    var tableInfo = MetaData.getTableInfo(that.tableid);
                    tableInfo.currentQuery = qry;
                    if ((settObj.activecolumns) && (that.visibilityControlsGroup) )
                        Controls.recallSettings(that.visibilityControlsGroup, settObj.activecolumns, false);

                };

                // Activates this view, and loads a query
                that.activateWithQuery = function(qry) {
                    that.activateState();
                    that.theQuery.modify(qry);
                };


                that.createFrames = function(rootFrame) {
                    rootFrame.makeGroupHor();
                    this.frameControls = rootFrame.addMemberFrame(Framework.FrameFinal('',0.2)).setMinSize(Framework.dimX,250);
                    this.frameTable = rootFrame.addMemberFrame(Framework.FrameFinal('', 0.8))//Create frame that will contain the table viewer
                        .setAllowScrollBars(false,false);
                }



                that.createPanels = function() {
                    //Initialise the data fetcher that will download the data for the table
                    this.theTableFetcher = DataFetchers.Table(
                        MetaData.serverUrl,
                        MetaData.database,
                        that.tableid + 'CMB_' + MetaData.workspaceid
                    );
                    this.theTableFetcher.setReportIfError(true);

                    this.theTableFetcher.setMaxRecordCount(that.tableInfo.settings.MaxCountQueryAggregated || 1000000)

                    this.createPanelTableViewer();
                    this.createPanelControls();

                    this.reLoad();
                    that.panelsCreated = true;

                };


                that.postLoadAction = function() {
                    if (that.hasBecomeVisible) {
                        that.myTable.preventFetch = false;
                        that.uptodate = false;
                        that.reLoad();
                    }
                };

                that.onBecomeVisible = function() {
                    if (!that.hasBecomeVisible) {
                        if (that.panelsCreated) {
                            if (that.viewIsLoaded) {
                                that.myTable.preventFetch = false;
                                that.uptodate = false;
                                that.reLoad();
                            }
                        }
                        that.hasBecomeVisible = true;
                    }
                }

                //Create the table viewer panel
                that.createPanelTableViewer = function () {
                    //Initialise the panel that will contain the table
                    var tableInfo = MetaData.getTableInfo(that.tableid);
                    this.panelTable = QueryTable.Panel(
                        this.frameTable,
                        this.theTableFetcher,
                        { leftfraction: 50 }
                    );
                    this.myTable = this.panelTable.getTable();// A shortcut variable
                    this.myTable.fetchBuffer = 300;
                    this.myTable.recordCountFetchType = DataFetchers.RecordCountFetchType.DELAYED;
                    this.myTable.preventFetch = true;
                    that.myTable.setQuery(that.theQuery.get());

                };


                that.createPanelControls = function () {
                    this.panelSimpleQuery = Framework.Form(this.frameControls);
                    this.panelSimpleQuery.setPadding(0);

                    var buttonCreatePlot = Controls.Button(null, { content: 'Create plot...', buttonClass: 'PnButtonLarge', width:120, height:40, bitmap:'Bitmaps/chart.png' });
                    buttonCreatePlot.setOnChanged(function() {
                        var subSamplingOptions = null;
                        if (that.theQuery.isSubSampling())
                            subSamplingOptions = that.theQuery.getSubSamplingOptions();
                        Msg.send({type: 'CreateDataItemPlot'}, {
                            tableid: that.tableid,
                            subSamplingOptions: subSamplingOptions
                        });
                    });

                    var ctrlQuery = that.theQuery.createQueryControl({}, [buttonCreatePlot]);
                    var tableInfo = MetaData.getTableInfo(that.tableid);




                    // Selection controls

                    that.selectedItemCountText = Controls.Html(null, '0 selected');

                    var selectionClear = Controls.Button(null, { content: 'Clear', buttonClass: 'DQXToolButton2'/*, width:120, height:40, bitmap: 'Bitmaps/circle_red_small.png'*/ });
                    selectionClear.setOnChanged(function() {
                        tableInfo.clearSelection();
                        Msg.broadcast({type:'SelectionUpdated'}, that.tableid);
                    });
                    var selectionAll = Controls.Button(null, { content: 'Select...', buttonClass: 'DQXToolButton2'/*, width:120, height:40, bitmap: 'Bitmaps/circle_red_small.png'*/ });
                    selectionAll.setOnChanged(function() {
                        ButtonChoiceBox.createQuerySelectionOptions(that.tableInfo, that.theQuery);
                    });
                    var selectionStore = Controls.Button(null, { content: 'Store...', buttonClass: 'DQXToolButton2'/*, width:120, height:40, bitmap: 'Bitmaps/circle_red_small.png'*/ });
                    selectionStore.setOnChanged(function() {
                        SelectionTools.cmdStore(that.tableInfo);
                    });

                    var groupSelection = Controls.Section(Controls.CompoundVert([
                        that.selectedItemCountText,
                        Controls.CompoundHor([selectionClear, selectionAll, selectionStore])
                    ]), {
                        title: 'Current selection',
                        bodyStyleClass: 'ControlsSectionBody'
                    });




                    that.visibilityControlsGroup = Controls.CompoundVert([]).setMargin(0);

                    that.controlsGroup = Controls.CompoundVert([
                        ctrlQuery,
                        groupSelection,
                        that.visibilityControlsGroup

                    ]).setMargin(0);

                    this.panelSimpleQuery.addControl(that.controlsGroup);
                }

                //Returns a user-friendly text description of a query
                that.getQueryDescription = function(qry) {
                    var str = '<div style="background-color: rgb(255,240,230);width:100%">';
                    if (!qry.isTrivial) {
                        nameMap = {};
                        $.each(MetaData.customProperties,function(idx,propInfo) {
                            if (propInfo.tableid == that.tableid)
                                nameMap[propInfo.propid] = {
                                    name: propInfo.name,
                                    toDisplayString: propInfo.toDisplayString
                                };
                        });
                        str += '<span style="color: rgb(128,0,0)"><b>Query:</b></span> <span style="color: rgb(128,0,0);font-size:80%">'+qry.toDisplayString(nameMap,0)+'</span>';
                    } else {
                      str += '<span style="color: rgb(128,0,0)"><b>Query:</b></span> <span style="color: rgb(128,0,0);font-size:80%">All</span>'
                    }
                    str += '</div>';
                    return str;
                };

                that.getRecordCount = function() {
                    if (!that.myTable)
                        return null;
                    return that.myTable.getRecordCount();
                };

                that.getSortColumn = function() {
                    if (!that.myTable)
                        return MetaData.getTableInfo(that.tableid).primkey;
                    return that.myTable.getSortColumn();
                };


                that.updateQuery2 = function() {
                    if (that.myTable) {
                        that.myTable.setQuery(that.theQuery.getForFetching());
                        that.myTable.setTable(that.tableInfo.getQueryTableName(that.theQuery.isSubSampling()));
                        that.myTable.reLoadTable();
                        var tableInfo = MetaData.getTableInfo(that.tableid);
                        tableInfo.currentQuery = that.theQuery.get();
                        Msg.broadcast({ type: 'QueryChanged'}, that.tableid );
                    }
                };

                that.createColumnPopup = function(propid) {
                    var colInfo = MetaData.findProperty(that.tableid, propid);
                    var content = '<p>';
                    if (colInfo.settings.Description)
                        content += colInfo.settings.Description;
                    else
                        content += 'No description available';
                    content += '<p>';
                    var buttons=[];
                    var thecol = that.panelTable.getTable().findColumn(propid);
                    if (thecol.sortOption) {
                        buttons.push( Controls.Button(null, { buttonClass: 'DQXToolButton2', content: "Sort<br>ascending", bitmap:DQX.BMP('arrow4down.png'), width:120, height:40 })
                            .setOnChanged(function() {
                                that.panelTable.getTable().sortByColumn(propid,false);
                                if (!Popup.isPinned(popupID))
                                    DQX.ClosePopup(popupID);
                            }) );
                        buttons.push( Controls.Button(null, { buttonClass: 'DQXToolButton2', content: "Sort<br>descending", bitmap:DQX.BMP('arrow4up.png'), width:120, height:40 })
                            .setOnChanged(function() {
                                that.panelTable.getTable().sortByColumn(propid,true);
                                if (!Popup.isPinned(popupID))
                                    DQX.ClosePopup(popupID);
                            }) );
                    }
/*                    if (thecol.linkFunction) {
                        buttons.push( Controls.Button(null, { buttonClass: 'DQXToolButton2', content: thecol.linkHint, width:170, height:50 })
                            .setOnChanged(function() {
                                thecol.linkFunction(id);
                                if (!Popup.isPinned(popupID))
                                    DQX.ClosePopup(popupID);
                            }) );
                    }*/

                    $.each(buttons,function(idx,bt) { content+=bt.renderHtml(); });
                    var popupID = Popup.create(colInfo.name, content);
                }


                // Initialise the table viewer columns
                that.reLoad = function() {
                    var tableInfo = MetaData.getTableInfo(that.tableid);

                    if (that.uptodate)
                        return;
                    that.uptodate = true;

                    this.theTableFetcher.resetAll();
                    that.myTable.clearTableColumns();

                    that.myTable.createSelectionColumn("sel", "", tableInfo.id, tableInfo.primkey, tableInfo, DQX.Color(1,0,0), function() {
                        Msg.broadcast({type:'SelectionUpdated'}, tableInfo.id);
                    });


                    //Temporarily store the column visibility status, in case this is a reload
                    that.columnVisibilityChecks = [];
                    that.visibilityControlsGroup.clear();

                    //Create sections for each property group
                    var propertyGroupSectionMap = {};
                    $.each(tableInfo.propertyGroups, function(idx, groupInfo) {
                        var showInTable = false;
                        $.each(groupInfo.properties, function(idx, propInfo) {
                            if (propInfo.settings.showInTable)
                                showInTable = true;
                        });
                        if (showInTable) {
                            var sctControls = Controls.CompoundVert([]).setMargin(5);
                            var sct = Controls.Section(sctControls, {
                                title: groupInfo.Name,
                                headerStyleClass: 'DQXControlSectionHeader',
                                bodyStyleClass: 'ControlsSectionBodySubSection'
                            });
                            sct.checkboxes = [];
                            sct.onCollapsing = function() {
                                sct.memChkStates = {};
                                $.each(sct.checkboxes, function(idx, chk) {
                                    sct.memChkStates[chk.getID()] = chk.getValue();
                                    chk.modifyValue(false);
                                });
                            }
                            sct.onExpanding = function() {
                                if (sct.memChkStates) {
                                    $.each(sct.checkboxes, function(idx, chk) {
                                        chk.modifyValue(sct.memChkStates[chk.getID()]);
                                    });
                                }
                            }
                            that.visibilityControlsGroup.addControl(sct);
                            propertyGroupSectionMap[groupInfo.Id] = {theList: sctControls, theSection: sct };
                        }
                    });

                    //Create a column for each property
                    $.each(MetaData.customProperties,function(idx,propInfo) {
                        if ((propInfo.tableid == that.tableid) && (propInfo.settings.showInTable)) {
                            var col = MiscUtils.createItemTableViewerColumn(that.myTable, that.tableid, propInfo.propid);

                            col.setHeaderClickHandler(function(id) {
                                that.createColumnPopup(id);
                            })

                            var canHide = true;
                            if (propInfo.isPrimKey) canHide = false;
                            if (propInfo.propid == that.tableInfo.ChromosomeField) canHide = false;
                            if (propInfo.propid == that.tableInfo.PositionField) canHide = false;

                            if (canHide) {
                                // Create checkbox that controls the visibility of the column
                                var chk = Controls.Check(null,{
                                    label:propInfo.name,
                                    value:tableInfo.isPropertyColumnVisible(col.myCompID),
                                    hint: propInfo.settings.Description
                                }).setClassID(propInfo.propid).setOnChanged(function() {
                                    that.myTable.findColumnRequired(chk.colID).setVisible(chk.getValue());
                                    that.myTable.render();
                                    tableInfo.setPropertyColumnVisible(chk.colID, chk.getValue());
                                });
                                chk.colID = col.myCompID;
                                if (!tableInfo.isPropertyColumnVisible(col.myCompID))
                                    col.setVisible(false);
                                propertyGroupSectionMap[propInfo.group.Id].theList.addControl(chk);
                                propertyGroupSectionMap[propInfo.group.Id].theSection.checkboxes.push(chk);
                                that.columnVisibilityChecks.push(chk);
                            }
                        }
                    });

                    if (that._storedTableSettings) {
                        that.myTable.recallSettings(that._storedTableSettings);
                        that._storedTableSettings = null;
                    }

                    that.myTable.reLoadTable();
                    this.panelSimpleQuery.render();
                }


                that.theQuery.notifyQueryUpdated = that.updateQuery2;
                return that;
            }

        };

        return TableViewerModule;
    });