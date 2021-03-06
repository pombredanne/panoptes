import DQXDbTools
import asyncresponder
import os
import config
import Utils


def ResponseExecute(returndata, calculationObject):

    databaseName = DQXDbTools.ToSafeIdentifier(returndata['database'])
    workspaceid = DQXDbTools.ToSafeIdentifier(returndata['workspaceid'])
    tableid = DQXDbTools.ToSafeIdentifier(returndata['tableid'])
    keyid = DQXDbTools.ToSafeIdentifier(returndata['keyid'])
    propid = DQXDbTools.ToSafeIdentifier(returndata['propid'])
    dataid = DQXDbTools.ToSafeIdentifier(returndata['dataid'])
    iscustom = int(returndata['iscustom']) > 0

    tableName =tableid
    if iscustom:
        tableName = Utils.GetTableWorkspaceProperties(workspaceid, tableid)

    print('storing selection '+dataid)

    filename = os.path.join(config.BASEDIR, 'temp', 'store_'+dataid)
    with open(filename, 'r') as fp:
        datastring = fp.read()
    os.remove(filename)


    credInfo = calculationObject.credentialInfo
    db = DQXDbTools.OpenDatabase(credInfo, databaseName)
    cur = db.cursor()
    credInfo.VerifyCanDo(DQXDbTools.DbOperationWrite(databaseName, tableName, propid))
    sqlstring = 'UPDATE {0} SET {1}=0 WHERE {1}=1'.format(tableName, propid)
    cur.execute(sqlstring)
    db.commit()

    if len(datastring) > 0:
        keys = datastring.split('\t')

        def submitkeys(keylist):
            if len(keylist) > 0:
                sqlstring = 'UPDATE {0} SET {1}=1 WHERE {2} IN ({3})'.format(tableName, propid, keyid, ', '.join(['"'+str(key)+'"' for key in keylist]))
                print(sqlstring)
                cur.execute(sqlstring)
                db.commit()

        keysublist = []
        keyNr = 0
        for key in keys:
            keysublist.append(key)
            if len(keysublist) >= 500:
                submitkeys(keysublist)
                keysublist = []
                calculationObject.SetInfo('Storing', keyNr*1.0/len(keys))
            keyNr +=1
        submitkeys(keysublist)

    db.close()



def response(returndata):
    retval = asyncresponder.RespondAsync(
        ResponseExecute,
        returndata,
        "Store selection"
    )
    return retval
