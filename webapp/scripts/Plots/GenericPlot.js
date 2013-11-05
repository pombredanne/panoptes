define(["require", "DQX/base64", "DQX/Application", "DQX/DataDecoders", "DQX/Framework", "DQX/Controls", "DQX/Msg", "DQX/SQL", "DQX/DocEl", "DQX/Utils", "DQX/Wizard", "DQX/Popup", "DQX/PopupFrame", "DQX/FrameCanvas", "DQX/DataFetcher/DataFetchers", "Wizards/EditQuery", "MetaData", "Utils/QueryTool"],
    function (require, base64, Application, DataDecoders, Framework, Controls, Msg, SQL, DocEl, DQX, Wizard, Popup, PopupFrame, FrameCanvas, DataFetchers, EditQuery, MetaData, QueryTool) {

        var GenericPlot = {};

        GenericPlot._registeredPlotTypes = {};
        GenericPlot.registerPlotType = function(plotTypeID, creationObject) {
            GenericPlot._registeredPlotTypes[plotTypeID] = creationObject;
        }

        GenericPlot.activePlotList = [];

        GenericPlot.Create = function(tableid, plotTypeID, settings) {
            settings.blocking = false;
            settings.sizeX = 700;
            settings.sizeY = 550;
            var that = PopupFrame.PopupFrame(tableid+'_'+plotTypeID, settings);
            GenericPlot.activePlotList.push(that);

            that.plotTypeID = plotTypeID;
            that.tableInfo = MetaData.mapTableCatalog[tableid];
            that.eventids = [];//Add event listener id's to this list to have them removed when the popup closes
            that.theQuery = QueryTool.Create(tableid);

            that.onClose = function() {
                $.each(that.eventids,function(idx,eventid) {
                    Msg.delListener(eventid);
                });
                var activeIndex = -1;
                $.each(GenericPlot.activePlotList, function(idx,plot) {
                    if (plot===that)
                        activeIndex = idx;
                });
                if (activeIndex>=0) {
                    GenericPlot.activePlotList.splice(activeIndex,1);
                }
                else
                    DQX.reportError('Plot not found!');
            };

            that.plotSettingsControls = {};
            that.addPlotSettingsControl = function(id, ctrl) {
                that.plotSettingsControls[id] = ctrl;
            }


            that.store = function() {
                var obj = {};
                obj.tableid = that.tableInfo.id;
                obj.plotTypeID = that.plotTypeID;
                obj.query = that.theQuery.store();
                obj.settings = {};
                $.each(that.plotSettingsControls, function(id, ctrl) {
                    obj.settings[id] = Controls.storeSettings(ctrl);
                });
                return obj;
            }

            that.recall = function(settObj) {
                if (settObj.query)
                    that.theQuery.recall(settObj.query);
                if (settObj.settings) {
                    that.staging = true;
                    $.each(that.plotSettingsControls, function(id, ctrl) {
                        if (settObj.settings[id])
                            Controls.recallSettings(ctrl, settObj.settings[id], false );
                    });
                    that.staging = false;
                }
                that.reloadAll();
            }

            return that;
        }

        GenericPlot.store = function() {
            var obj = [];
            $.each(GenericPlot.activePlotList, function(idx,plot) {
                obj.push(plot.store());
            });
            return obj;
        }

        GenericPlot.recall = function(settObj) {
            $.each(settObj, function(idx,plotSettObj) {
                var plotGenerator = GenericPlot._registeredPlotTypes[plotSettObj.plotTypeID];
                if (!plotGenerator)
                    DQX.reportError('Unknown plot type: '+plotSettObj.plotTypeID);
                var thePlot = plotGenerator.Create(plotSettObj.tableid);
                thePlot.recall(plotSettObj);
            });
        }

        return GenericPlot;
    });


