import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Switch,
  TouchableOpacity,
  TextInput,
  StyleSheet,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useDietary } from '../../context/DietaryContext';

const Row = ({ title, value, onValueChange }) => (
  <View style={styles.row}>
    <Text style={styles.rowText}>{title}</Text>
    <Switch value={value} onValueChange={onValueChange} />
  </View>
);

const Section = ({ title, children }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>
);

export default function DietaryPreferencesScreen() {
  const router = useRouter();
  const { preferences, setPreferences } = useDietary(); // ✅ get context

  // Allergy preferences
  const [glutenFree, setGlutenFree] = useState(
    preferences.allergies?.glutenFree || false
  );
  const [dairyFree, setDairyFree] = useState(
    preferences.allergies?.dairyFree || false
  );
  const [nutsFree, setNutsFree] = useState(
    preferences.allergies?.nutsFree || false
  );
  const [shellfishFree, setShellfishFree] = useState(
    preferences.allergies?.shellfishFree || false
  );
  const [eggFree, setEggFree] = useState(
    preferences.allergies?.eggFree || false
  );
  const [otherAllergies, setOtherAllergies] = useState(
    preferences.allergies?.otherAllergies || ''
  );

  // Diet type
  const [vegetarian, setVegetarian] = useState(
    preferences.dietType?.vegetarian || false
  );
  const [vegan, setVegan] = useState(preferences.dietType?.vegan || false);
  const [pescatarian, setPescatarian] = useState(
    preferences.dietType?.pescatarian || false
  );
  const [keto, setKeto] = useState(preferences.dietType?.keto || false);
  const [lowCarb, setLowCarb] = useState(
    preferences.dietType?.lowCarb || false
  );
  const [otherDiet, setOtherDiet] = useState(
    preferences.dietType?.otherDiet || ''
  );

  // Food preferences
  const [spicy, setSpicy] = useState(
    preferences.foodPreferences?.spicy || false
  );
  const [sweet, setSweet] = useState(
    preferences.foodPreferences?.sweet || false
  );
  const [salty, setSalty] = useState(
    preferences.foodPreferences?.salty || false
  );
  const [otherFoodPref, setOtherFoodPref] = useState(
    preferences.foodPreferences?.otherFoodPref || ''
  );

  const savePreferences = () => {
    setPreferences({
      allergies: {
        glutenFree,
        dairyFree,
        nutsFree,
        shellfishFree,
        eggFree,
        otherAllergies,
      },
      dietType: { vegetarian, vegan, pescatarian, keto, lowCarb, otherDiet },
      foodPreferences: { spicy, sweet, salty, otherFoodPref },
    });
    alert('Preferences saved!');
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="chevron-left" size={28} color="#F07F13" />
        </TouchableOpacity>
        <Text style={styles.headerText}>Dietary Preferences</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40, paddingTop: 16 }}>
        {/* Allergies */}
        <Section title="Allergies">
          <Row
            title="Gluten"
            value={glutenFree}
            onValueChange={setGlutenFree}
          />
          <Row title="Dairy" value={dairyFree} onValueChange={setDairyFree} />
          <Row title="Nuts" value={nutsFree} onValueChange={setNutsFree} />
          <Row
            title="Shellfish"
            value={shellfishFree}
            onValueChange={setShellfishFree}
          />
          <Row title="Eggs" value={eggFree} onValueChange={setEggFree} />
          <TextInput
            style={styles.input}
            placeholder="Other allergies..."
            value={otherAllergies}
            onChangeText={setOtherAllergies}
            multiline
          />
        </Section>

        {/* Diet Type */}
        <Section title="Diet Type">
          <Row
            title="Vegetarian"
            value={vegetarian}
            onValueChange={setVegetarian}
          />
          <Row title="Vegan" value={vegan} onValueChange={setVegan} />
          <Row
            title="Pescatarian"
            value={pescatarian}
            onValueChange={setPescatarian}
          />
          <Row title="Keto" value={keto} onValueChange={setKeto} />
          <Row title="Low-Carb" value={lowCarb} onValueChange={setLowCarb} />
          <TextInput
            style={styles.input}
            placeholder="Other diet type..."
            value={otherDiet}
            onChangeText={setOtherDiet}
          />
        </Section>

        {/* Food Preferences */}
        <Section title="Food Preferences">
          <Row title="Spicy" value={spicy} onValueChange={setSpicy} />
          <Row title="Sweet" value={sweet} onValueChange={setSweet} />
          <Row title="Salty" value={salty} onValueChange={setSalty} />
          <TextInput
            style={styles.input}
            placeholder="Other food preferences..."
            value={otherFoodPref}
            onChangeText={setOtherFoodPref}
          />
        </Section>

        {/* Save Button */}
        <TouchableOpacity style={styles.saveBtn} onPress={savePreferences}>
          <Text style={styles.saveText}>Save Preferences</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    elevation: 2,
  },
  headerText: { fontSize: 22, fontWeight: 'bold', color: '#0f172a' },
  section: {
    marginHorizontal: 20,
    marginBottom: 24,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 6,
  },
  rowText: { fontSize: 16, color: '#111' },
  input: {
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: '#111',
    marginTop: 8,
  },
  saveBtn: {
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: '#F07F13',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
