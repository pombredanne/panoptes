import os
import DQXDbTools
import DQXUtils
import config
import sys
import customresponders.uploadtracks.VTTable as VTTable
import SettingsLoader
import ImpUtils
import uuid
import shutil
import customresponders.uploadtracks.Utils as Utils

import ImportDataTable
import ImportRefGenome
import ImportWorkspaces



def ImportDataSet(calculationObject, baseFolder, datasetId, importSettings):
    with calculationObject.LogHeader('Importing dataset {0}'.format(datasetId)):
        calculationObject.Log('Import settings: '+str(importSettings))
        DQXUtils.CheckValidIdentifier(datasetId)
        datasetFolder = os.path.join(baseFolder, datasetId)
        indexDb = 'datasetindex'

        #raise Exception('Something went wrong')


        globalSettings = SettingsLoader.SettingsLoader(os.path.join(datasetFolder, 'settings'))
        globalSettings.RequireTokens(['Name'])

        print('Global settings: '+str(globalSettings.Get()))

        ImpUtils.ExecuteSQL(calculationObject, indexDb, 'DELETE FROM datasetindex WHERE id="{0}"'.format(datasetId))

        if not importSettings['ConfigOnly']:
            # Dropping existing database
            calculationObject.SetInfo('Dropping database')
            print('Dropping database')
            try:
                ImpUtils.ExecuteSQL(calculationObject, indexDb, 'DROP DATABASE IF EXISTS {0}'.format(datasetId))
            except:
                pass
            ImpUtils.ExecuteSQL(calculationObject, indexDb, 'CREATE DATABASE {0}'.format(datasetId))

            # Creating new database
            scriptPath = os.path.dirname(os.path.realpath(__file__))
            calculationObject.SetInfo('Creating database')
            print('Creating new database')
            ImpUtils.ExecuteSQLScript(calculationObject, scriptPath + '/createdataset.sql', datasetId)

        ImpUtils.ExecuteSQL(calculationObject, datasetId, 'DELETE FROM propertycatalog')
        ImpUtils.ExecuteSQL(calculationObject, datasetId, 'DELETE FROM summaryvalues')
        ImpUtils.ExecuteSQL(calculationObject, datasetId, 'DELETE FROM tablecatalog')

        datatables = []

        if globalSettings.HasToken('DataTables'):
            if not type(globalSettings['DataTables']) is list:
                raise Exception('DataTables token should be a list')
            datatables = globalSettings['DataTables']


        for dir in os.listdir(os.path.join(datasetFolder,'datatables')):
            if os.path.isdir(os.path.join(datasetFolder, 'datatables', dir)):
                if dir not in datatables:
                    datatables.append(dir)
        print('Data tables: '+str(datatables))
        for datatable in datatables:
            ImportDataTable.ImportDataTable(calculationObject, datasetId, datatable, os.path.join(datasetFolder, 'datatables', datatable), importSettings)

        if os.path.exists(os.path.join(datasetFolder, 'refgenome')):
            ImportRefGenome.ImportRefGenome(calculationObject, datasetId, os.path.join(datasetFolder, 'refgenome'), importSettings)
            globalSettings.AddTokenIfMissing('hasGenomeBrowser', True)

        ImportWorkspaces.ImportWorkspaces(calculationObject, datasetFolder, datasetId, importSettings)

        # Global settings
        print('Defining global settings')
        ImpUtils.ImportGlobalSettings(calculationObject, datasetId, globalSettings)

        # Finalise: register dataset
        print('Registering data set')
        ImpUtils.ExecuteSQL(calculationObject, indexDb, 'INSERT INTO datasetindex VALUES ("{0}", "{1}")'.format(datasetId, globalSettings['Name']))



# def ImportFileSet(baseFolder):
#     datasets = []
#     for dir in os.listdir(baseFolder):
#         if os.path.isdir(os.path.join(baseFolder, dir)):
#             datasets.append(dir)
#     for dataset in datasets:
#         ImportDataSet(calculationObject, baseFolder, dataset)


if __name__ == "__main__":
    import customresponders.uploadtracks.asyncresponder as asyncresponder
    calc = asyncresponder.CalculationThread('', None, {}, '')
    ImportDataSet(calc, config.SOURCEDATADIR + '/datasets', 'Sample1',
        {
            'ConfigOnly': False
        }
    )
