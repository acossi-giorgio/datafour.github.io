import pandas as pd
import json
import os

def create_network_data():
    # Load data
    df = pd.read_csv('../raw_datasets/middle_east_aggregated_data.csv', sep=';')
    
    # Extract year from WEEK column (format: dd-mmmm-yyyy)
    df['YEAR'] = df['WEEK'].str.split('-').str[-1].astype(int)
    
    # Filter for last 10 years
    max_year = df['YEAR'].max()
    min_year = max_year - 9  # Last 10 years inclusive
    df = df[df['YEAR'] >= min_year]
    
    # Aggregate data: Sum of events for each Country-EventType pair
    grouped = df.groupby(['COUNTRY', 'EVENT_TYPE'])['EVENTS'].sum().reset_index()
    
    # Create Nodes
    # 1. Country nodes
    countries = grouped['COUNTRY'].unique()
    country_nodes = [{"id": country, "group": "country"} for country in countries]
    
    # 2. Event Type nodes
    event_types = grouped['EVENT_TYPE'].unique()
    event_nodes = [{"id": etype, "group": "event_type"} for etype in event_types]
    
    nodes = country_nodes + event_nodes
    
    # Create Links
    links = []
    for index, row in grouped.iterrows():
        if row['EVENTS'] > 0:
            links.append({
                "source": row['COUNTRY'],
                "target": row['EVENT_TYPE'],
                "value": int(row['EVENTS'])
            })
            
    graph_data = {
        "nodes": nodes,
        "links": links
    }
    
    # Ensure directory exists
    os.makedirs('../datasets', exist_ok=True)
    
    # Save to JSON
    with open('../datasets/network_data.json', 'w') as f:
        json.dump(graph_data, f, indent=2)
        
    print(f"Network data created successfully at ../datasets/network_data.json")
    print(f"Data range: {min_year} - {max_year} (last 10 years)")

if __name__ == "__main__":
    create_network_data()
