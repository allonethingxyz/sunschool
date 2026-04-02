import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, G, Text as SvgText, Path, Defs, Marker } from 'react-native-svg';
import { colors, typography } from '../styles/theme';
import { ZoomIn, ZoomOut } from 'react-feather';

interface Node {
  id: string;
  label: string;
  x?: number;
  y?: number;
}

interface Edge {
  source: string;
  target: string;
}

interface GraphData {
  nodes: Node[];
  edges: Edge[];
}

interface KnowledgeGraphProps {
  graph: GraphData;
}

const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({ graph }) => {
  const { nodes = [], edges = [] } = graph || {};
  
  // State for selected node
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [showFullLabels, setShowFullLabels] = useState(false);
  
  // Use refs for node positions
  const nodePositions = useRef<Record<string, { x: number, y: number }>>({});
  
  // Simple zoom state
  const [zoom, setZoom] = useState(1);
  
  const { width: windowWidth } = useWindowDimensions();
  const width = windowWidth - 64;
  const height = 300; // Made taller for better visualization
  
  // Handle zoom in and out
  const handleZoomIn = () => {
    setZoom(Math.min(2, zoom + 0.2));
  };
  
  const handleZoomOut = () => {
    setZoom(Math.max(0.5, zoom - 0.2));
  };
  
  // Handle reset view
  const handleResetView = () => {
    setZoom(1);
  };
  
  // Initialize node positions using a simple force-directed layout
  useEffect(() => {
    if (nodes.length === 0) return;
    
    // Initialize positions with a simple circle layout if not defined
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.35;
    
    nodes.forEach((node, i) => {
      if (node.x === undefined || node.y === undefined) {
        const angle = (i * 2 * Math.PI) / nodes.length;
        nodePositions.current[node.id] = {
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle),
        };
      } else {
        nodePositions.current[node.id] = { x: node.x, y: node.y };
      }
    });
  }, [nodes, width, height]);
  
  // No gesture handlers in this simple version
  
  // Handle node selection
  const handleNodePress = (nodeId: string) => {
    setSelectedNode(selectedNode === nodeId ? null : nodeId);
  };
  
  // If no nodes, show empty state
  if (nodes.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>
          No knowledge graph data available yet.
        </Text>
      </View>
    );
  }
  
  return (
    <View style={styles.graphWrapper}>
      <View style={styles.controlsContainer}>
        <TouchableOpacity 
          style={styles.controlButton} 
          onPress={handleZoomIn}
        >
          <ZoomIn size={16} color={colors.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.controlButton} 
          onPress={handleZoomOut}
        >
          <ZoomOut size={16} color={colors.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.controlButton} 
          onPress={handleResetView}
        >
          <Text style={styles.resetText}>Reset</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.controlButton, showFullLabels ? styles.controlButtonActive : {}]} 
          onPress={() => setShowFullLabels(!showFullLabels)}
        >
          <Text style={[styles.resetText, showFullLabels ? styles.controlTextActive : {}]}>
            {showFullLabels ? 'Hide Labels' : 'Show Labels'}
          </Text>
        </TouchableOpacity>
      </View>
      
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.container, { transform: [{ scale: zoom }] }]}>
          <Svg width={width} height={height}>
            <Defs>
              <Marker
                id="arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto"
              >
                <Path
                  d="M 0 0 L 10 5 L 0 10 z"
                  fill={colors.primaryLight}
                />
              </Marker>
            </Defs>
            <G>
              {/* Draw edges with arrows */}
              {edges.map((edge, i) => {
                const source = nodePositions.current[edge.source];
                const target = nodePositions.current[edge.target];
                
                if (!source || !target) return null;
                
                // Calculate distance for arrow positioning
                const dx = target.x - source.x;
                const dy = target.y - source.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                // Adjust end points to not overlap with circles
                const nodeRadius = 20;
                const ratio = (distance - nodeRadius) / distance;
                
                const endX = source.x + dx * ratio;
                const endY = source.y + dy * ratio;
                
                const isRelatedToSelected = 
                  selectedNode && (edge.source === selectedNode || edge.target === selectedNode);
                
                return (
                  <Line
                    key={`edge-${i}`}
                    x1={source.x}
                    y1={source.y}
                    x2={endX}
                    y2={endY}
                    stroke={isRelatedToSelected ? colors.primary : colors.primaryLight}
                    strokeWidth={isRelatedToSelected ? 3 : 2}
                    opacity={selectedNode ? (isRelatedToSelected ? 1 : 0.3) : 0.7}
                    markerEnd="url(#arrow)"
                  />
                );
              })}
              
              {/* Draw nodes */}
              {nodes.map((node) => {
                const position = nodePositions.current[node.id];
                if (!position) return null;
                
                const isSelected = selectedNode === node.id;
                const isConnected = selectedNode && edges.some(
                  edge => (edge.source === selectedNode && edge.target === node.id) ||
                         (edge.target === selectedNode && edge.source === node.id)
                );
                
                // Determine node appearance based on selection state
                const nodeOpacity = selectedNode ? 
                  (isSelected || isConnected ? 1 : 0.4) : 1;
                
                const nodeFill = isSelected ? 
                  colors.secondary : colors.primary;
                
                const nodeSize = isSelected ? 24 : 20;
                
                return (
                  <G key={node.id}>
                    {/* Main circle for the node */}
                    <Circle
                      cx={position.x}
                      cy={position.y}
                      r={nodeSize}
                      fill={nodeFill}
                      opacity={nodeOpacity}
                      onPress={() => handleNodePress(node.id)}
                    />
                    
                    {/* Text label inside circle */}
                    <SvgText
                      x={position.x}
                      y={position.y}
                      textAnchor="middle"
                      alignmentBaseline="middle"
                      fontSize={10}
                      fontWeight={isSelected ? 'bold' : 'normal'}
                      fill={colors.onPrimary}
                    >
                      {node.label.substring(0, 8)}
                      {node.label.length > 8 ? '...' : ''}
                    </SvgText>
                    
                    {/* Full label outside circle (optional) */}
                    {(showFullLabels || isSelected) && node.label.length > 8 && (
                      <SvgText
                        x={position.x}
                        y={position.y + nodeSize + 12}
                        textAnchor="middle"
                        fontSize={11}
                        fontWeight="bold"
                        fill={colors.textPrimary}
                        opacity={nodeOpacity}
                      >
                        {node.label}
                      </SvgText>
                    )}
                  </G>
                );
              })}
            </G>
          </Svg>
        </View>
      </ScrollView>
      
      {selectedNode && (
        <View style={styles.infoPanel}>
          <Text style={styles.infoPanelTitle}>
            {nodes.find(n => n.id === selectedNode)?.label}
          </Text>
          <Text style={styles.infoPanelSubtitle}>
            Connected to {edges.filter(e => e.source === selectedNode || e.target === selectedNode).length} concepts
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  graphWrapper: {
    flex: 1,
    backgroundColor: colors.surfaceColor,
    borderRadius: 8,
    padding: 8,
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
    elevation: 2,
    marginBottom: 16,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    minHeight: 320,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    height: 250,
  },
  emptyText: {
    ...typography.body2,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  controlsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 4,
    marginBottom: 8,
  },
  controlButton: {
    padding: 8,
    marginHorizontal: 4,
    backgroundColor: colors.surfaceColor,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  controlButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  resetText: {
    ...typography.caption,
    color: colors.textPrimary,
  },
  controlTextActive: {
    color: colors.onPrimary,
  },
  infoPanel: {
    backgroundColor: colors.primaryLight,
    borderRadius: 8,
    padding: 16,
    margin: 8,
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
  },
  infoPanelTitle: {
    ...typography.subtitle1,
    color: colors.onPrimary,
    marginBottom: 4,
  },
  infoPanelSubtitle: {
    ...typography.body2,
    color: colors.onPrimary,
  },
});

export default KnowledgeGraph;
