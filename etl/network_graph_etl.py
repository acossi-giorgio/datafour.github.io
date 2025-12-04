import pandas as pd
import json
import os

def create_network_data():
    # Load data
    df = pd.read_csv('raw_datasets/middle_east_aggregated_data.csv', sep=';')
    
    # Aggregate data: Sum of events for each Country-EventType pair
    # We can also filter by year if we want, but let's take the total for now
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
    os.makedirs('datasets', exist_ok=True)
    
    # Save to JSON
    with open('datasets/network_data.json', 'w') as f:
        json.dump(graph_data, f, indent=2)
        
    print("Network data created successfully at datasets/network_data.json")

if __name__ == "__main__":
    create_network_data()
