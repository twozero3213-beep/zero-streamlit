from datetime import date

from decimal import Decimal, localcontext

import re

INVALID = 'RESEARCH_DESK_INVALID'

ERRORS = (OSError, ValueError, TypeError, KeyError, UnicodeError, ArithmeticError, RecursionError)

def _object(value, keys):
    if not isinstance(value, dict) or set(value) != keys: raise ValueError(INVALID)

def _day(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value): raise ValueError(INVALID)
    return date.fromisoformat(value)

def _list(value, limit):
    if not isinstance(value,list) or len(value)>limit: raise ValueError(INVALID)
    return value

def _normal(value):
    if value==0:return '0'
    text=format(value,'f')
    return text.rstrip('0').rstrip('.') if '.' in text else text

def _decimal(value, nullable=False, limit=80):
    if value is None and nullable:return None
    if not isinstance(value,str) or len(value)>limit or not re.fullmatch(r'[+-]?[0-9]+(?:\.[0-9]+)?',value):raise ValueError(INVALID)
    number=Decimal(value)
    if not number.is_finite():raise ValueError(INVALID)
    return _normal(number)

def _period(value):
    if not isinstance(value,str):raise ValueError(INVALID)
    if re.fullmatch(r'[0-9]{4}-[0-9]{2}',value):return 'MONTHLY',date.fromisoformat(value+'-01')
    if re.fullmatch(r'[0-9]{4}Q[1-4]',value):return 'QUARTERLY',date(int(value[:4]),3*(int(value[-1])-1)+1,1)
    if re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}',value):return 'DAILY',_day(value)
    raise ValueError(INVALID)

def _history(history,frequency=None):
    rows,seen=[],set()
    for row in _list(history,150):
        _object(row,{'period','value'});kind,_=_period(row['period'])
        if frequency is None:frequency=kind
        if kind!=frequency or row['period'] in seen:raise ValueError(INVALID)
        seen.add(row['period']);rows.append(dict(period=row['period'],value=_decimal(row['value'])))
    return sorted(rows,key=lambda row:row['period'])

def _cutoff(end):
    try:return end.replace(year=max(1,end.year-10))
    except ValueError:return end.replace(year=max(1,end.year-10),day=28)

def descriptive_statistics(history):
    """Type-7 sample descriptions within a ten-year cutoff, never an investment threshold."""
    try:
        rows=_history(history)
        if rows:
            cutoff=_cutoff(_period(rows[-1]['period'])[1]);rows=[row for row in rows if _period(row['period'])[1]>=cutoff]
        count=len(rows)
        result=dict(window_years=10,start_period=rows[0]['period'] if rows else None,end_period=rows[-1]['period'] if rows else None,
            sample_count=count,mean=None,median=None,p25=None,p75=None,method='LINEAR_TYPE7',available=count>=2)
        if count>=2:
            values=sorted(Decimal(row['value']) for row in rows)
            with localcontext() as context:
                context.prec=96
                def quantile(q):
                    position=Decimal(count-1)*q;lower=int(position);fraction=position-lower
                    return values[lower]+(values[min(lower+1,count-1)]-values[lower])*fraction
                result.update(mean=_normal(sum(values)/count),median=_normal(quantile(Decimal('0.5'))),
                              p25=_normal(quantile(Decimal('0.25'))),p75=_normal(quantile(Decimal('0.75'))))
        return result
    except ERRORS:raise ValueError(INVALID) from None
