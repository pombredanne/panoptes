import DQXDbTools
import os
import h5py
import itertools
import numpy as np
import config
import arraybuffer
from gzipstream import gzip

#curl 'http://localhost:8000/app01?datatype=custom&respmodule=2d_server&respid=2d_query&dataset=Genotypes&col_qry=eyJ3aGNDbGFzcyI6InRyaXZpYWwiLCJpc0NvbXBvdW5kIjpmYWxzZSwiVHBlIjoiIiwiaXNUcml2aWFsIjp0cnVlfQ==&row_qry=eyJ3aGNDbGFzcyI6InRyaXZpYWwiLCJpc0NvbXBvdW5kIjpmYWxzZSwiVHBlIjoiIiwiaXNUcml2aWFsIjp0cnVlfQ==&datatable=genotypes&property=first_allele&col_order=SnpName&row_order=ID' -H 'Pragma: no-cache' -H 'Accept-Encoding: gzip,deflate,sdch' --compressed

def index_from_query(db, table, index_column, query, order):
    cur = db.cursor()
    where = DQXDbTools.WhereClause()
    where.ParameterPlaceHolder = '%s'#NOTE!: MySQL PyODDBC seems to require this nonstardard coding
    where.Decode(query)
    where.CreateSelectStatement()
    query = "WHERE " + where.querystring_params if len(where.querystring_params) > 0 else ''
    sqlquery = "SELECT {index_column} FROM {table} {query} ORDER BY {order}".format(**locals())
    cur.execute(sqlquery, where.queryparams)
    result = [row[0] for row in cur.fetchall()]
    cur.close()
    return result


def select_by_list(property_array, col_idx, row_idx):
    num_cells = len(col_idx) * len(row_idx)
    coords = ((row, col) for row in row_idx for col in col_idx)
    CHUNK_SIZE = 400
    result_array = np.empty((num_cells,), dtype=property_array.id.dtype)
    num_chunks = num_cells / CHUNK_SIZE
    num_chunks = num_chunks + 1 if num_cells % CHUNK_SIZE else num_chunks
    for i in xrange(num_chunks):
        selection = np.asarray(list(itertools.islice(coords, CHUNK_SIZE)))
        sel = h5py._hl.selections.PointSelection(property_array.shape)
        sel.set(selection)
        out = np.ndarray(sel.mshape, property_array.id.dtype)
        property_array.id.read(h5py.h5s.create_simple(sel.mshape),
                               sel._id,
                               out,
                               h5py.h5t.py_create(property_array.id.dtype))
        result_array[i * CHUNK_SIZE: (i * CHUNK_SIZE)+len(selection)] = out[:]
    result_array.shape = (len(row_idx), len(col_idx))
    return result_array


def get_table_names(db, datatable):
    cur = db.cursor()
    sql = 'SELECT col_table, row_table FROM 2D_tablecatalog WHERE id=%s'
    cur.execute(sql, (datatable,))
    result = cur.fetchall()[0]
    cur.close()
    return result


def response(request_data):
    return request_data


def handler(start_response, request_data):
    datatable = request_data['datatable']
    dataset = request_data['dataset']
    property = request_data['property']
    col_qry = request_data['col_qry']
    col_order = request_data['col_order']
    row_qry = request_data['row_qry']
    row_order = request_data['row_order']

    db = DQXDbTools.OpenDatabase(DQXDbTools.ParseCredentialInfo(request_data), dataset)
    col_table, row_table = get_table_names(db, datatable)

    col_idx = index_from_query(db,
                               col_table,
                               datatable + '_column_index',
                               col_qry,
                               col_order)

    row_idx = index_from_query(db,
                               row_table,
                               datatable + '_row_index',
                               row_qry,
                               row_order)
    db.close()
    hdf5_file = h5py.File(os.path.join(config.BASEDIR, '2D_data', datatable + '.hdf5'), 'r')
    property_array = hdf5_file[property]
    if len(col_idx) == 0 or len(row_idx) == 0:
        data = gzip(''.join(arraybuffer.encode_array(np.array([], dtype=property_array.id.dtype))))
    else:
        data = select_by_list(property_array, col_idx, row_idx)
        data = gzip(''.join(arraybuffer.encode_array(data)))
    status = '200 OK'
    response_headers = [('Content-type', 'text/plain'),
                        ('Content-Length', str(len(data))),
                        ('Content-Encoding', 'gzip')]
    start_response(status, response_headers)
    yield data



